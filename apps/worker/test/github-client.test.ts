import { generateKeyPairSync, verify as cryptoVerify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MockAgent, fetch as undiciFetch } from 'undici';
import { describe, expect, it } from 'vitest';

import { PermanentJobError } from '../src/errors.js';
import { createAppJwt } from '../src/github/app-jwt.js';
import { createGitHubClient, type GitHubClientOptions } from '../src/github/client.js';

// GitHub hands out PKCS#1 keys — the test uses the same format on purpose.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

const BASE = 'https://github.stub';

function stubbedClient(): {
  client: ReturnType<typeof createGitHubClient>;
  pool: ReturnType<MockAgent['get']>;
} {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const pool = agent.get(BASE);
  const fetchImpl = ((url: string, init?: object) =>
    undiciFetch(url, {
      ...init,
      dispatcher: agent,
    })) as unknown as NonNullable<GitHubClientOptions['fetchImpl']>;
  const client = createGitHubClient({
    appId: '12345',
    privateKeyPem: PRIVATE_PEM,
    baseUrl: BASE,
    fetchImpl,
  });
  return { client, pool };
}

function interceptToken(pool: ReturnType<MockAgent['get']>, times = 1): void {
  pool
    .intercept({ path: '/app/installations/55/access_tokens', method: 'POST' })
    .reply(201, {
      token: 'ghs_testtoken',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    .times(times);
}

describe('createAppJwt', () => {
  it('produces a valid RS256 JWT with GitHub-compatible claims', () => {
    const now = Date.now();
    const jwt = createAppJwt('12345', PRIVATE_PEM, now);
    const [header, payload, signature] = jwt.split('.');

    const verified = cryptoVerify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature!, 'base64url'),
    );
    expect(verified).toBe(true);

    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString()) as {
      iat: number;
      exp: number;
      iss: string;
    };
    expect(claims.iss).toBe('12345');
    expect(claims.iat).toBe(Math.floor(now / 1000) - 60);
    // Inside GitHub's 10-minute ceiling.
    expect(claims.exp - Math.floor(now / 1000)).toBeLessThanOrEqual(600);
  });
});

describe('createGitHubClient', () => {
  it('exchanges the app JWT for an installation token', async () => {
    const { client, pool } = stubbedClient();
    interceptToken(pool);

    const token = await client.getInstallationToken(55n);
    expect(token).toBe('ghs_testtoken');
  });

  it('caches the installation token across calls', async () => {
    const { client, pool } = stubbedClient();
    // Exactly one interception available: a second HTTP call would throw.
    interceptToken(pool, 1);

    await client.getInstallationToken(55n);
    const again = await client.getInstallationToken(55n);
    expect(again).toBe('ghs_testtoken');
  });

  it('lists run artifacts with the installation token', async () => {
    const { client, pool } = stubbedClient();
    interceptToken(pool);
    pool
      .intercept({ path: /\/repos\/o\/r\/actions\/runs\/99\/artifacts.*/, method: 'GET' })
      .reply(200, {
        total_count: 1,
        artifacts: [{ id: 7, name: 'junit-results', size_in_bytes: 1234, expired: false }],
      });

    const artifacts = await client.listRunArtifacts(55n, 'o', 'r', 99n);
    expect(artifacts).toEqual([
      { id: 7, name: 'junit-results', sizeInBytes: 1234, expired: false },
    ]);
  });

  it('classifies 404 as permanent (never retried)', async () => {
    const { client, pool } = stubbedClient();
    interceptToken(pool);
    pool
      .intercept({ path: /\/repos\/o\/r\/actions\/runs\/99\/artifacts.*/, method: 'GET' })
      .reply(404, { message: 'Not Found' });

    await expect(client.listRunArtifacts(55n, 'o', 'r', 99n)).rejects.toBeInstanceOf(
      PermanentJobError,
    );
  });

  it('classifies 500 as transient (retryable)', async () => {
    const { client, pool } = stubbedClient();
    interceptToken(pool);
    pool
      .intercept({ path: /\/repos\/o\/r\/actions\/runs\/99\/artifacts.*/, method: 'GET' })
      .reply(500, 'boom');

    const error = await client.listRunArtifacts(55n, 'o', 'r', 99n).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentJobError);
  });

  it('downloads an artifact zip to a file', async () => {
    const { client, pool } = stubbedClient();
    interceptToken(pool);
    const bytes = Buffer.from('PK-fake-zip-bytes');
    pool.intercept({ path: '/repos/o/r/actions/artifacts/7/zip', method: 'GET' }).reply(200, bytes);

    const dest = join(tmpdir(), `devflow-test-artifact-${Date.now()}.zip`);
    await client.downloadArtifactToFile(55n, 'o', 'r', 7, dest);
    expect(await readFile(dest)).toEqual(bytes);
  });
});
