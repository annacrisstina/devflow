import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { PermanentJobError } from '../errors.js';
import { createAppJwt } from './app-jwt.js';

export type GitHubArtifact = {
  id: number;
  name: string;
  sizeInBytes: number;
  expired: boolean;
};

export type GitHubClientOptions = {
  appId: string;
  privateKeyPem: string;
  /** Overridable for tests and the local e2e stub. */
  baseUrl?: string;
  /** Injectable for MockAgent-based tests. */
  fetchImpl?: FetchLike;
};

export type CheckRunParams = {
  /** Stable check name (ADR-0011): PATCHes must land on the same check. */
  name: string;
  /** Always 'neutral' in DevFlow — advisory by construction (ADR-0011). */
  conclusion: 'neutral';
  output: { title: string; summary: string };
};

type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  body: unknown;
  text(): Promise<string>;
}>;

type CachedToken = { token: string; expiresAtMs: number };

const GITHUB_API = 'https://api.github.com';
// Refresh tokens 5 minutes before GitHub's stated expiry.
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Minimal GitHub App client: token dance + the endpoints the pipeline needs
 * (M2 artifact reads, M3 check-run writes).
 * Rate-limit handling is deliberately simple (429/403 → transient error →
 * queue backoff retries); proactive header tracking is a documented later
 * refinement, not an M2 requirement.
 */
export function createGitHubClient(options: GitHubClientOptions) {
  const baseUrl = options.baseUrl ?? GITHUB_API;
  const fetchImpl: FetchLike = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  // The promise is cached (not the token) so concurrent jobs for one
  // installation share a single in-flight exchange instead of stampeding.
  const tokenCache = new Map<string, Promise<CachedToken>>();

  async function getInstallationToken(installationId: bigint): Promise<string> {
    const key = installationId.toString();
    const cached = tokenCache.get(key);
    if (cached !== undefined) {
      const token = await cached.catch(() => null);
      if (token !== null && token.expiresAtMs - TOKEN_EXPIRY_BUFFER_MS > Date.now()) {
        return token.token;
      }
      tokenCache.delete(key);
    }

    const pending = exchangeToken(installationId);
    tokenCache.set(key, pending);
    try {
      return (await pending).token;
    } catch (error) {
      tokenCache.delete(key);
      throw error;
    }
  }

  async function exchangeToken(installationId: bigint): Promise<CachedToken> {
    const jwt = createAppJwt(options.appId, options.privateKeyPem);
    const response = await fetchImpl(
      `${baseUrl}/app/installations/${installationId.toString()}/access_tokens`,
      { method: 'POST', headers: githubHeaders(`Bearer ${jwt}`) },
    );
    if (!response.ok) throw await requestError('installation token exchange', response);
    const body = (await response.json()) as { token: string; expires_at: string };
    return { token: body.token, expiresAtMs: new Date(body.expires_at).getTime() };
  }

  async function listRunArtifacts(
    installationId: bigint,
    owner: string,
    repo: string,
    githubRunId: bigint,
  ): Promise<GitHubArtifact[]> {
    const token = await getInstallationToken(installationId);
    const artifacts: GitHubArtifact[] = [];
    // Bounded pagination: 10 pages × 100 covers any sane run.
    for (let page = 1; page <= 10; page++) {
      const response = await fetchImpl(
        `${baseUrl}/repos/${owner}/${repo}/actions/runs/${githubRunId.toString()}/artifacts?per_page=100&page=${page}`,
        { headers: githubHeaders(`token ${token}`) },
      );
      if (!response.ok) throw await requestError('artifact listing', response);
      const body = (await response.json()) as {
        total_count: number;
        artifacts: Array<{ id: number; name: string; size_in_bytes: number; expired: boolean }>;
      };
      artifacts.push(
        ...body.artifacts.map((a) => ({
          id: a.id,
          name: a.name,
          sizeInBytes: a.size_in_bytes,
          expired: a.expired,
        })),
      );
      if (artifacts.length >= body.total_count || body.artifacts.length === 0) break;
    }
    return artifacts;
  }

  async function downloadArtifactToFile(
    installationId: bigint,
    owner: string,
    repo: string,
    artifactId: number,
    destPath: string,
  ): Promise<void> {
    const token = await getInstallationToken(installationId);
    // fetch follows the 302 to blob storage and drops the auth header
    // cross-origin on its own.
    const response = await fetchImpl(
      `${baseUrl}/repos/${owner}/${repo}/actions/artifacts/${artifactId.toString()}/zip`,
      { headers: githubHeaders(`token ${token}`) },
    );
    if (!response.ok || response.body === null) {
      throw await requestError('artifact download', response);
    }
    const readable = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
    await pipeline(readable, createWriteStream(destPath));
  }

  async function createCheckRun(
    installationId: bigint,
    owner: string,
    repo: string,
    headSha: string,
    params: CheckRunParams,
  ): Promise<bigint> {
    const token = await getInstallationToken(installationId);
    const response = await fetchImpl(`${baseUrl}/repos/${owner}/${repo}/check-runs`, {
      method: 'POST',
      headers: githubHeaders(`token ${token}`),
      body: JSON.stringify({
        name: params.name,
        head_sha: headSha,
        status: 'completed',
        conclusion: params.conclusion,
        completed_at: new Date().toISOString(),
        output: params.output,
      }),
    });
    if (!response.ok) throw await requestError('check run creation', response);
    const body = (await response.json()) as { id: number };
    return BigInt(body.id);
  }

  async function updateCheckRun(
    installationId: bigint,
    owner: string,
    repo: string,
    checkRunId: bigint,
    params: CheckRunParams,
  ): Promise<void> {
    const token = await getInstallationToken(installationId);
    const response = await fetchImpl(
      `${baseUrl}/repos/${owner}/${repo}/check-runs/${checkRunId.toString()}`,
      {
        method: 'PATCH',
        headers: githubHeaders(`token ${token}`),
        body: JSON.stringify({
          name: params.name,
          status: 'completed',
          conclusion: params.conclusion,
          completed_at: new Date().toISOString(),
          output: params.output,
        }),
      },
    );
    if (!response.ok) throw await requestError('check run update', response);
  }

  return {
    getInstallationToken,
    listRunArtifacts,
    downloadArtifactToFile,
    createCheckRun,
    updateCheckRun,
  };
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;

function githubHeaders(authorization: string): Record<string, string> {
  return {
    authorization,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'devflow',
  };
}

async function requestError(
  operation: string,
  response: { status: number; text(): Promise<string> },
): Promise<Error> {
  // Body content is not included: it can echo request details; status is enough.
  if (response.status === 404 || response.status === 410) {
    return new PermanentJobError(`${operation} failed: HTTP ${response.status} (gone)`);
  }
  // Everything else (401 clock drift, 403/429 rate limits, 5xx) is transient:
  // thrown as a plain error so the queue retries with backoff.
  return new Error(`${operation} failed: HTTP ${response.status}`);
}
