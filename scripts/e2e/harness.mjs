// Shared e2e/demo primitives: stub GitHub API, signed webhook deliveries,
// JUnit artifact zips, process management with the hygiene this repo learned
// the hard way (detached process groups, port preflights, truthy polls).
// Used by scripts/e2e/run.mjs and scripts/demo/seed.mjs.
import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');

const requireWorker = createRequire(`${ROOT}/apps/worker/package.json`);
const requireDb = createRequire(`${ROOT}/packages/db/package.json`);
export const yazl = requireWorker('yazl');
export const pg = requireDb('pg');
export const requireApi = createRequire(`${ROOT}/apps/api/package.json`);

export function zipOf(xml) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from(xml), 'results/junit.xml');
    zip.end();
    const chunks = [];
    zip.outputStream.on('data', (c) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
}

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** JUnit XML for a suite of {className, name, failed, message?, timeSec?}. */
export function junitXml(suiteName, cases) {
  const failures = cases.filter((c) => c.failed).length;
  const body = cases
    .map(
      (c) =>
        `  <testcase classname="${escapeXml(c.className)}" name="${escapeXml(c.name)}" time="${c.timeSec ?? 0.1}">${
          c.failed ? `<failure message="${escapeXml(c.message ?? 'failed')}">stack</failure>` : ''
        }</testcase>`,
    )
    .join('\n');
  return `<?xml version="1.0"?>\n<testsuite name="${escapeXml(suiteName)}" tests="${cases.length}" failures="${failures}">\n${body}\n</testsuite>`;
}

/**
 * In-memory stub of the GitHub API surface the worker uses: installation
 * tokens, per-run artifact listings, artifact zips, check runs.
 */
export function createStubGitHub() {
  const artifactZips = new Map();
  const runArtifacts = new Map();
  const checkRuns = [];
  let nextCheckId = 424240;
  let nextArtifactId = 77000;

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const url = req.url ?? '';
      if (req.method === 'POST' && /^\/app\/installations\/\d+\/access_tokens/.test(url)) {
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            token: 'stub-token',
            expires_at: new Date(Date.now() + 3600e3).toISOString(),
          }),
        );
        return;
      }
      let m = url.match(/^\/repos\/[^/]+\/[^/]+\/actions\/runs\/(\d+)\/artifacts/);
      if (req.method === 'GET' && m) {
        const artifactId = runArtifacts.get(Number(m[1]));
        const artifacts =
          artifactId === undefined
            ? []
            : [
                {
                  id: artifactId,
                  name: 'test-results',
                  size_in_bytes: artifactZips.get(artifactId).length,
                  expired: false,
                },
              ];
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ total_count: artifacts.length, artifacts }));
        return;
      }
      m = url.match(/^\/repos\/[^/]+\/[^/]+\/actions\/artifacts\/(\d+)\/zip/);
      if (req.method === 'GET' && m) {
        res.writeHead(200, { 'content-type': 'application/zip' });
        res.end(artifactZips.get(Number(m[1])));
        return;
      }
      if (req.method === 'POST' && /^\/repos\/[^/]+\/[^/]+\/check-runs$/.test(url)) {
        const id = ++nextCheckId;
        checkRuns.push({ method: 'POST', id, body: JSON.parse(body) });
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id }));
        return;
      }
      m = url.match(/^\/repos\/[^/]+\/[^/]+\/check-runs\/(\d+)$/);
      if (req.method === 'PATCH' && m) {
        checkRuns.push({ method: 'PATCH', id: Number(m[1]), body: JSON.parse(body) });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: Number(m[1]) }));
        return;
      }
      res.writeHead(404).end('{}');
    });
  });

  return {
    server,
    checkRuns,
    listen: (port) => new Promise((r) => server.listen(port, '127.0.0.1', r)),
    close: () => server.close(),
    /** Registers a run's artifact zip; returns nothing (listing is by run id). */
    async setRunArtifact(runId, xml) {
      const artifactId = ++nextArtifactId;
      artifactZips.set(artifactId, await zipOf(xml));
      runArtifacts.set(runId, artifactId);
    },
  };
}

/**
 * Signs and POSTs a workflow_run.completed delivery to a local API.
 * `guid` (optional) makes deliveries deterministic — the seed script uses it
 * so re-runs converge through the duplicate-GUID repair path (ADR-0005).
 */
export function createDeliverer({ apiPort, webhookSecret }) {
  return async function deliver(payload, { guid } = {}) {
    const body = JSON.stringify(payload);
    const response = await fetch(`http://127.0.0.1:${apiPort}/webhooks/github`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-delivery': guid ?? randomUUID(),
        'x-github-event': 'workflow_run',
        'x-hub-signature-256': `sha256=${createHmac('sha256', webhookSecret).update(body).digest('hex')}`,
      },
      body,
    });
    if (response.status !== 202 && response.status !== 200) {
      throw new Error(`delivery not accepted: ${response.status}`);
    }
    return response.status;
  };
}

export function workflowRunPayload({
  runId,
  attempt = 1,
  sha,
  branch,
  conclusion,
  repo,
  installationId,
  // Optional ISO timestamp: run_started_at drives detection chronology and
  // decay, so the seed script fabricates histories by dating runs in the past.
  startedAt,
}) {
  return {
    action: 'completed',
    workflow_run: {
      id: runId,
      name: 'CI',
      head_branch: branch,
      head_sha: sha,
      run_number: 1,
      run_attempt: attempt,
      event: 'pull_request',
      status: 'completed',
      conclusion,
      run_started_at: startedAt ?? new Date().toISOString(),
    },
    repository: {
      id: repo.githubId,
      name: repo.name,
      private: false,
      owner: { login: repo.owner, type: 'User' },
      default_branch: 'main',
    },
    installation: { id: installationId },
  };
}

/** Truthy-only poll: pg's rowCount 0 must keep polling (the M5 lesson). */
export async function poll(label, fn, timeoutMs = 90_000, everyMs = 500) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

const children = [];

/**
 * Spawns an app in its own detached process group so cleanup can kill pnpm
 * AND its tsx grandchildren (the M3/M4 leaked-worker lesson, structural).
 */
export function spawnApp(name, cwd, entry, env, { verbose = false } = {}) {
  const child = spawn('pnpm', ['exec', 'tsx', entry], {
    cwd,
    env: { ...process.env, ...env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.on('data', (d) => verbose && console.log(`[${name}]`, d.toString().trim()));
  child.stderr.on('data', (d) => console.error(`[${name}!]`, d.toString().trim()));
  children.push(child);
  return child;
}

export function killAllSpawned() {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/** Fails loudly if a stale listener would hijack the run (the M1 lesson). */
export async function assertPortsFree(ports) {
  for (const port of ports) {
    const taken = await fetch(`http://127.0.0.1:${port}/healthz`)
      .then(() => true)
      .catch(() => false);
    if (taken) {
      throw new Error(`port ${port} already has a listener — kill leftover processes first`);
    }
  }
}

/** Drops and recreates a throwaway database, then applies migrations. */
export async function freshDatabase(adminUrl, name) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  await new Promise((resolve, reject) => {
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    const p = spawn('pnpm', ['--filter', '@devflow/db', 'db:migrate'], {
      cwd: ROOT,
      env: {
        ...process.env,
        DEVFLOW_DATABASE_URL: url.toString(),
        PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
      },
      stdio: 'inherit',
    });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`migrate exit ${code}`))));
  });
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
