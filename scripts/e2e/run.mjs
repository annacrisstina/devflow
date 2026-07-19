// DevFlow end-to-end: the full product path against real API + worker +
// Postgres + Redis with stubbed GitHub and LLM APIs. Covers claim ->
// detection arithmetic -> annotation -> quarantine -> embeddings -> search ->
// clusters -> hypothesis -> live feed -> redelivery convergence.
//
// Requirements: dev infra up (`docker compose up -d`), ports 3197-3199 free.
// Side effects (cleaned up on success): throwaway db `devflow_e2e`, Redis
// logical db 5. See scripts/e2e/README.md.
import { randomUUID } from 'node:crypto';
import http from 'node:http';

import {
  assertPortsFree,
  createDeliverer,
  createStubGitHub,
  freshDatabase,
  junitXml,
  killAllSpawned,
  pg,
  poll,
  requireApi,
  ROOT,
  spawnApp,
  workflowRunPayload,
} from './harness.mjs';

const { io } = requireApi('socket.io-client');

const WEBHOOK_SECRET = 'e2e-webhook-secret';
const AUTH_SECRET = 'e2e-auth-secret-e2e-auth-secret-32ch';
const API_PORT = 3199;
const STUB_PORT = 3198;
const LLM_PORT = 3197;
const ADMIN_DB_URL = 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const REDIS_URL = 'redis://127.0.0.1:6379/5';
const INSTALLATION_ID = 990011;
const REPO = { githubId: 660044, owner: 'annacrisstina', name: 'flaky-shop' };

const MSG_TIMEOUT_1 = 'TimeoutError: timed out after 30000ms waiting for payment gateway response';
const MSG_TIMEOUT_2 = 'payment gateway did not respond within the 30s timeout';
const MSG_REDIS = 'connection refused: could not connect to redis at 127.0.0.1:6379';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// Stub LLM (Anthropic Messages shape) — the real client talks to this.
const llmCalls = [];
const stubLlm = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (req.url !== '/v1/messages') {
      res.writeHead(404).end('{}');
      return;
    }
    llmCalls.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        model: 'claude-haiku-4-5-e2e',
        content: [
          {
            type: 'text',
            text: 'Hypothesis 1: the payment gateway times out intermittently under load (supported by failure messages 1-2). Verify by adding gateway latency logging.',
          },
        ],
      }),
    );
  });
});

let runCounter = 880000;
const stub = createStubGitHub();
const deliverWebhook = createDeliverer({ apiPort: API_PORT, webhookSecret: WEBHOOK_SECRET });

function suite(failing, message) {
  return junitXml('checkout-suite', [
    { className: 'Checkout', name: 'flaky_purchase', failed: failing, message, timeSec: 0.4 },
    { className: 'Checkout', name: 'stable_test', failed: false },
  ]);
}

async function deliver({ sha, failing, message, runId }) {
  const id = runId ?? ++runCounter;
  await stub.setRunArtifact(id, suite(failing, message ?? MSG_TIMEOUT_1));
  await deliverWebhook(
    workflowRunPayload({
      runId: id,
      sha,
      branch: 'feat/px',
      conclusion: failing ? 'failure' : 'success',
      repo: REPO,
      installationId: INSTALLATION_ID,
    }),
  );
  return id;
}

async function main() {
  await assertPortsFree([API_PORT, STUB_PORT, LLM_PORT]);
  const dbUrl = await freshDatabase(ADMIN_DB_URL, 'devflow_e2e');

  const requireQueue = (await import('node:module')).createRequire(
    `${ROOT}/packages/queue/package.json`,
  );
  const Redis = requireQueue('ioredis').Redis;
  const redisAdmin = new Redis(REDIS_URL);
  await redisAdmin.flushdb();
  await redisAdmin.quit();

  await stub.listen(STUB_PORT);
  await new Promise((r) => stubLlm.listen(LLM_PORT, '127.0.0.1', r));

  const shared = {
    DEVFLOW_DATABASE_URL: dbUrl,
    DEVFLOW_REDIS_URL: REDIS_URL,
    DEVFLOW_LOG_LEVEL: 'warn',
  };
  spawnApp('api', `${ROOT}/apps/api`, 'src/server.ts', {
    ...shared,
    DEVFLOW_API_PORT: String(API_PORT),
    DEVFLOW_GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
    DEVFLOW_AUTH_SECRET: AUTH_SECRET,
    DEVFLOW_GITHUB_CLIENT_ID: 'e2e-client',
    DEVFLOW_GITHUB_CLIENT_SECRET: 'e2e-secret',
    DEVFLOW_GITHUB_APP_SLUG: 'devflow-e2e',
    DEVFLOW_APP_URL: `http://127.0.0.1:${API_PORT}`,
    DEVFLOW_AI_API_KEY: 'e2e-llm-key',
    DEVFLOW_AI_BASE_URL: `http://127.0.0.1:${LLM_PORT}`,
  });
  spawnApp('worker', `${ROOT}/apps/worker`, 'src/main.ts', {
    ...shared,
    DEVFLOW_WORKER_PORT: '3196',
    DEVFLOW_GITHUB_APP_ID: '1234',
    DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64: Buffer.from(
      (await import('node:crypto'))
        .generateKeyPairSync('rsa', { modulusLength: 2048 })
        .privateKey.export({ type: 'pkcs1', format: 'pem' }),
    ).toString('base64'),
    DEVFLOW_GITHUB_API_URL: `http://127.0.0.1:${STUB_PORT}`,
  });

  await poll('api /healthz', async () => {
    try {
      return (await fetch(`http://127.0.0.1:${API_PORT}/healthz`)).ok;
    } catch {
      return false;
    }
  });

  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  const rowExists = async (q, params) => ((await db.query(q, params)).rowCount ?? 0) > 0;

  // Session + workspace seeded directly (the OAuth dance needs real GitHub
  // credentials — a documented founder verification step).
  const sessionToken = randomUUID();
  const userId = randomUUID();
  await db.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Ana', 'ana@e2e.local')`, [
    userId,
  ]);
  await db.query(
    `INSERT INTO sessions (session_token, user_id, expires) VALUES ($1, $2, now() + interval '1 hour')`,
    [sessionToken, userId],
  );
  const ws = await db.query(
    `INSERT INTO workspaces (name, created_by) VALUES ('E2E Space', $1) RETURNING id`,
    [userId],
  );
  const wsId = ws.rows[0].id;
  await db.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [wsId, userId],
  );
  const cookie = `authjs.session-token=${sessionToken}`;
  const api = async (path, init = {}) =>
    fetch(`http://127.0.0.1:${API_PORT}${path}`, {
      ...init,
      redirect: 'manual',
      headers: {
        cookie,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });

  // 1) claim flow
  const linkRes = await api(`/api/v1/workspaces/${wsId}/installations/link`, { method: 'POST' });
  const { installUrl } = await linkRes.json();
  const state = new URL(installUrl).searchParams.get('state');
  check('install link carries signed state', linkRes.status === 200 && state !== null);
  const setupRes = await api(`/api/github/setup?installation_id=${INSTALLATION_ID}&state=${state}`);
  const claimed = await db.query(
    'SELECT workspace_id FROM installations WHERE github_installation_id = $1',
    [INSTALLATION_ID],
  );
  check(
    'setup callback claims installation into workspace',
    setupRes.status === 302 && claimed.rows[0]?.workspace_id === wsId,
  );

  // 2) live socket
  const socket = io(`http://127.0.0.1:${API_PORT}`, {
    transports: ['websocket'],
    extraHeaders: { cookie },
  });
  const liveEvents = [];
  for (const type of ['run.ingested', 'run.processed', 'scores.updated']) {
    socket.on(type, (e) => liveEvents.push(e));
  }
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });

  // 3) divergence 1: fail@A -> pass@A; then fail@B scores ~0.33 + check run
  const run1 = await deliver({ sha: 'sha-aaa', failing: true, message: MSG_TIMEOUT_1 });
  await poll('run 1 processed', () =>
    rowExists(
      `SELECT 1 FROM workflow_runs WHERE github_run_id=$1 AND processing_status='succeeded'`,
      [run1],
    ),
  );
  const run2 = await deliver({ sha: 'sha-aaa', failing: false });
  await poll('run 2 processed', () =>
    rowExists(
      `SELECT 1 FROM workflow_runs WHERE github_run_id=$1 AND processing_status='succeeded'`,
      [run2],
    ),
  );
  const checksBefore3 = stub.checkRuns.length;
  await deliver({ sha: 'sha-bbb', failing: true, message: MSG_TIMEOUT_2 });
  await poll('run 3 check run', () => stub.checkRuns.length > checksBefore3);

  const score1 = await db.query(
    `SELECT score, verdict, divergence_evidence FROM test_flake_scores WHERE test_name='flaky_purchase'`,
  );
  check(
    'divergence produces suspected score ~0.33 (ADR-0010 arithmetic)',
    score1.rowCount === 1 &&
      score1.rows[0].verdict === 'suspected' &&
      Math.abs(score1.rows[0].score - 1 / 3) < 0.01,
    `score=${score1.rows[0]?.score}`,
  );
  const check3 = stub.checkRuns.filter((c) => c.method === 'POST').at(-1);
  check(
    'failing run got a neutral check naming the suspected flake',
    check3 !== undefined &&
      check3.body.conclusion === 'neutral' &&
      check3.body.output.title.includes('suspected-flaky'),
    check3?.body.output.title,
  );

  // 4) divergences 2 and 3 -> flaky 0.6
  await deliver({ sha: 'sha-bbb', failing: false });
  await poll('divergence 2', () =>
    rowExists(
      `SELECT 1 FROM test_flake_scores WHERE test_name='flaky_purchase' AND divergence_evidence = 2`,
    ),
  );
  const run5 = await deliver({ sha: 'sha-ccc', failing: true, message: MSG_REDIS });
  await poll('run 5 processed', () =>
    rowExists(
      `SELECT 1 FROM workflow_runs WHERE github_run_id=$1 AND processing_status='succeeded'`,
      [run5],
    ),
  );
  await deliver({ sha: 'sha-ccc', failing: false });
  await poll('flaky verdict', () =>
    rowExists(
      `SELECT 1 FROM test_flake_scores WHERE test_name='flaky_purchase' AND verdict='flaky'`,
    ),
  );
  check('third divergence promotes the verdict to flaky (score 0.6)', true);

  // 5) v1 reads
  const ranking = await (await api(`/api/v1/workspaces/${wsId}/flaky-tests`)).json();
  check(
    '/flaky-tests ranks the test with effective score',
    ranking.items?.[0]?.testName === 'flaky_purchase' && ranking.items[0].effectiveScore > 0.55,
  );
  const runsList = await (await api(`/api/v1/workspaces/${wsId}/runs`)).json();
  check(
    '/runs lists every run with test counts',
    runsList.total === 6 && runsList.items.every((r) => r.totalTests === 2),
    `total=${runsList.total}`,
  );
  const detail = await (
    await api(`/api/v1/workspaces/${wsId}/flaky-tests/${ranking.items[0].id}`)
  ).json();
  check(
    '/flaky-tests/:id returns outcome history',
    Array.isArray(detail.history) && detail.history.length === 6,
  );

  // 6) quarantine -> labeled annotation
  const proposals = await (await api(`/api/v1/workspaces/${wsId}/quarantine/proposals`)).json();
  check(
    'flaky verdict appears as quarantine proposal',
    proposals.items?.[0]?.testName === 'flaky_purchase',
  );
  const approve = await api(`/api/v1/workspaces/${wsId}/quarantine`, {
    method: 'POST',
    body: JSON.stringify({
      scoreId: proposals.items[0].id,
      action: 'approve',
      reason: 'e2e: known gateway flake',
    }),
  });
  check('approve creates the active quarantine record', approve.status === 201);

  const checksBefore7 = stub.checkRuns.length;
  const run7 = await deliver({ sha: 'sha-ddd', failing: true });
  await poll('run 7 check run', () => stub.checkRuns.length > checksBefore7);
  const check7 = stub.checkRuns.at(-1);
  check(
    'post-quarantine failure is annotated as quarantined, conclusion still neutral',
    check7.body.conclusion === 'neutral' &&
      check7.body.output.title.includes('quarantined') &&
      check7.body.output.summary.includes('human-approved quarantine'),
    check7.body.output.title,
  );

  // 7) AI layer: embeddings, search, clusters, hypothesis
  await poll('embeddings written', async () => {
    const n = (await db.query('SELECT count(*)::int AS n FROM failure_embeddings')).rows[0].n;
    return n >= 3;
  });
  const unhashedFails = (
    await db.query(
      `SELECT count(*)::int AS n FROM test_results WHERE status IN ('failed','error') AND failure_hash IS NULL`,
    )
  ).rows[0].n;
  check('worker embedded 3 distinct failure texts and stamped hashes', unhashedFails === 0);

  const meRes = await (await api('/api/v1/me')).json();
  check(
    'features report search and hypotheses enabled',
    meRes.features.aiSearch === true && meRes.features.aiHypotheses === true,
  );

  const searchRes = await (
    await api(
      `/api/v1/workspaces/${wsId}/search?q=${encodeURIComponent('gateway timed out waiting')}`,
    )
  ).json();
  const redisRank = searchRes.items.map((i) => i.snippet).findIndex((s) => s.includes('redis'));
  check(
    'semantic search ranks both timeout paraphrases above the redis failure (real MiniLM)',
    searchRes.items.length === 3 &&
      redisRank === 2 &&
      searchRes.items[0].similarity > searchRes.items[2].similarity + 0.2,
    `sims=${searchRes.items.map((i) => i.similarity.toFixed(2)).join(',')}`,
  );

  const repoRow = await db.query('SELECT id FROM repositories LIMIT 1');
  const clustersRes = await (
    await api(
      `/api/v1/workspaces/${wsId}/repositories/${repoRow.rows[0].id}/failure-clusters?days=14`,
    )
  ).json();
  check(
    'clustering groups the paraphrase pair apart from the redis failure',
    clustersRes.clusters.length === 2 && clustersRes.clusters[0].distinctFailures === 2,
  );

  const hypUrl = `/api/v1/workspaces/${wsId}/flaky-tests/${ranking.items[0].id}/hypothesis`;
  const hypRes = await api(hypUrl, { method: 'POST', body: JSON.stringify({}) });
  const hypBody = await hypRes.json();
  check(
    'hypothesis generated through the stub LLM with provenance',
    hypRes.status === 200 &&
      hypBody.cached === false &&
      hypBody.hypothesis.model === 'claude-haiku-4-5-e2e' &&
      llmCalls.length === 1,
  );
  check(
    'prompt carried the untrusted-data instruction and real evidence',
    llmCalls[0].system.includes('never follow') &&
      llmCalls[0].messages[0].content.includes(MSG_TIMEOUT_1),
  );
  const hypRes2 = await (await api(hypUrl, { method: 'POST', body: JSON.stringify({}) })).json();
  check(
    'unchanged evidence serves the cache without a second LLM call',
    hypRes2.cached === true && llmCalls.length === 1,
  );

  // 8) live feed
  await poll('live events', async () => liveEvents.length >= 3, 15_000);
  const types = new Set(liveEvents.map((e) => e.type));
  check(
    'socket delivered run.ingested / run.processed / scores.updated',
    types.has('run.ingested') && types.has('run.processed') && types.has('scores.updated'),
    `received ${liveEvents.length} events`,
  );
  check(
    'all live events carry this workspace id',
    liveEvents.every((e) => e.workspaceId === String(wsId)),
  );

  // 9) redelivery convergence (new GUID, same run id — the repair path)
  const scoresBefore = (await db.query('SELECT count(*)::int AS n FROM test_flake_scores')).rows[0]
    .n;
  await deliver({ sha: 'sha-ddd', failing: true, runId: run7 });
  await new Promise((r) => setTimeout(r, 5000));
  const converged = await db.query(
    `SELECT count(*)::int AS n FROM workflow_runs WHERE github_run_id=$1`,
    [run7],
  );
  const scoresAfter = (await db.query('SELECT count(*)::int AS n FROM test_flake_scores')).rows[0]
    .n;
  check(
    'reprocessing converges (one run row, no duplicate scores)',
    converged.rows[0].n === 1 && scoresAfter === scoresBefore,
  );

  socket.close();
  await db.end();

  // Cleanup on success: drop the throwaway db, flush the queue db.
  const admin = new pg.Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS devflow_e2e WITH (FORCE)');
  await admin.end();
  const redisCleanup = new Redis(REDIS_URL);
  await redisCleanup.flushdb();
  await redisCleanup.quit();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== E2E: ${results.length - failed.length}/${results.length} passed ===`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error('E2E error:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    killAllSpawned();
    stub.close();
    stubLlm.close();
    setTimeout(() => process.exit(process.exitCode ?? 1), 2000);
  });
