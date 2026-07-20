// DevFlow demo seeder (M6, decision D-M6-2): replays a curated synthetic
// history through the REAL pipeline — signed webhook deliveries into a
// scratch API + worker with a stubbed GitHub API — landing in the LOCAL dev
// database so the dashboard has a story to tell. Not a SQL dump on purpose:
// a replay can never drift from the schema and every row carries honest
// provenance (webhook_events -> runs -> results -> scores).
//
// The story it seeds (timestamps spread over ~2 weeks so decay is visible):
//   checkout-service   Checkout.retries_on_timeout  3 same-commit divergences -> flaky (~0.53)
//                      Cart.updates_quantity        2 recent divergences      -> suspected (~0.46)
//                      Legacy.always_red            fails every run           -> zero evidence (broken != flaky)
//                      + healthy tests, 4 distinct failure texts for search/clusters
//   search-service     3 healthy mainline runs (a second repo for the dashboard)
//
// Requirements: dev infra up (`docker compose up -d`), `pnpm install` and
// `pnpm build` done (the spawned apps import the packages' compiled dist),
// ports 3191-3193 free. Side effects: rows in the dev database (the point);
// Redis logical db 4 flushed before and after. Re-runs converge: deliveries
// use deterministic GUIDs, so replays follow the ADR-0005 repair path.
import {
  assertBuilt,
  assertPortsFree,
  createDeliverer,
  createStubGitHub,
  junitXml,
  killAllSpawned,
  pg,
  poll,
  ROOT,
  spawnApp,
  workflowRunPayload,
} from '../e2e/harness.mjs';

const API_PORT = 3193;
const STUB_PORT = 3192;
const WORKER_PORT = 3191;
const REDIS_URL = 'redis://127.0.0.1:6379/4';
const DB_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const WEBHOOK_SECRET = 'demo-seed-webhook-secret';

const INSTALLATION_ID = 770001;
const CHECKOUT = { githubId: 550001, owner: 'annacrisstina', name: 'checkout-service' };
const SEARCH = { githubId: 550002, owner: 'annacrisstina', name: 'search-service' };

const MSG_GATEWAY_1 = 'TimeoutError: timed out after 30000ms waiting for payment gateway response';
const MSG_GATEWAY_2 = 'payment gateway did not respond within the 30s timeout';
const MSG_DB = 'connection refused: could not connect to postgres at 10.0.3.7:5432';
const MSG_LEGACY = 'AssertionError: expected 200 to be 410 — endpoint retired in v2';

// Demo tooling must be structurally unable to hit a real deployment.
const dbHost = new URL(DB_URL).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(dbHost)) {
  console.error(`refusing to seed non-local database host "${dbHost}" — this is demo tooling`);
  process.exit(1);
}

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function checkoutSuite({ retriesFail, retriesMsg, cartFail }) {
  return junitXml('checkout-suite', [
    {
      className: 'Checkout',
      name: 'retries_on_timeout',
      failed: retriesFail,
      message: retriesMsg,
      timeSec: 1.2,
    },
    {
      className: 'Cart',
      name: 'updates_quantity',
      failed: cartFail,
      message: MSG_DB,
      timeSec: 0.3,
    },
    { className: 'Legacy', name: 'always_red', failed: true, message: MSG_LEGACY, timeSec: 0.1 },
    { className: 'Checkout', name: 'stable_add_to_cart', failed: false },
    { className: 'Api', name: 'health_returns_ok', failed: false },
  ]);
}

function searchSuite() {
  return junitXml('search-suite', [
    { className: 'Search', name: 'indexes_documents', failed: false, timeSec: 0.5 },
    { className: 'Search', name: 'ranks_results', failed: false, timeSec: 0.4 },
  ]);
}

// The curated history. Each divergence is a same-sha fail->pass pair; the
// flip's evidence timestamp is the SECOND run of the pair (score.ts), so the
// pass runs carry the dates the arithmetic in the review is pinned to.
const RUNS = [
  // Checkout.retries_on_timeout: divergences land at days -12, -6, -1
  {
    id: 910001,
    repo: CHECKOUT,
    branch: 'feat/checkout-retry',
    sha: 'c0ffee1',
    day: 12.5,
    retriesFail: true,
    retriesMsg: MSG_GATEWAY_1,
  },
  {
    id: 910002,
    repo: CHECKOUT,
    branch: 'feat/checkout-retry',
    sha: 'c0ffee1',
    day: 12,
    retriesFail: false,
  },
  {
    id: 910003,
    repo: CHECKOUT,
    branch: 'feat/checkout-retry',
    sha: 'c0ffee2',
    day: 6.5,
    retriesFail: true,
    retriesMsg: MSG_GATEWAY_2,
  },
  {
    id: 910004,
    repo: CHECKOUT,
    branch: 'feat/checkout-retry',
    sha: 'c0ffee2',
    day: 6,
    retriesFail: false,
  },
  // Cart.updates_quantity: fail -> pass -> fail on one sha = two recent
  // divergences (~0.46). The trailing failure matters: the event-driven
  // recompute set only reassesses tests that are failing now or already
  // non-healthy (M3 design), so a story ending on a pass would stay at 0.
  { id: 910005, repo: CHECKOUT, branch: 'feat/cart-fix', sha: 'c0ffee3', day: 3.2, cartFail: true },
  { id: 910006, repo: CHECKOUT, branch: 'feat/cart-fix', sha: 'c0ffee3', day: 3, cartFail: false },
  { id: 910012, repo: CHECKOUT, branch: 'feat/cart-fix', sha: 'c0ffee3', day: 2.8, cartFail: true },
  {
    id: 910007,
    repo: CHECKOUT,
    branch: 'feat/checkout-retry',
    sha: 'c0ffee4',
    day: 1.5,
    retriesFail: true,
    retriesMsg: MSG_GATEWAY_1,
  },
  {
    id: 910008,
    repo: CHECKOUT,
    branch: 'feat/checkout-retry',
    sha: 'c0ffee4',
    day: 1,
    retriesFail: false,
  },
  // A second, healthy repo so the dashboard shows more than one project.
  { id: 910009, repo: SEARCH, branch: 'main', sha: 'beef001', day: 8 },
  { id: 910010, repo: SEARCH, branch: 'main', sha: 'beef002', day: 4 },
  { id: 910011, repo: SEARCH, branch: 'main', sha: 'beef003', day: 1 },
];

const stub = createStubGitHub();
const deliverWebhook = createDeliverer({ apiPort: API_PORT, webhookSecret: WEBHOOK_SECRET });

async function deliverRun(run) {
  const xml =
    run.repo === CHECKOUT
      ? checkoutSuite({
          retriesFail: run.retriesFail ?? false,
          retriesMsg: run.retriesMsg,
          cartFail: run.cartFail ?? false,
        })
      : searchSuite();
  await stub.setRunArtifact(run.id, xml);
  await deliverWebhook(
    workflowRunPayload({
      runId: run.id,
      sha: run.sha,
      branch: run.branch,
      // Legacy.always_red fails in every checkout run, so those runs always
      // conclude 'failure'; search-service runs are green.
      conclusion: run.repo === CHECKOUT ? 'failure' : 'success',
      repo: run.repo,
      installationId: INSTALLATION_ID,
      startedAt: daysAgo(run.day),
    }),
    { guid: `seed-devflow-${run.id}` },
  );
}

async function main() {
  assertBuilt();
  await assertPortsFree([WORKER_PORT, STUB_PORT, API_PORT]);
  await stub.listen(STUB_PORT);

  const requireQueue = (await import('node:module')).createRequire(
    `${ROOT}/packages/queue/package.json`,
  );
  const Redis = requireQueue('ioredis').Redis;
  const redisAdmin = new Redis(REDIS_URL);
  await redisAdmin.flushdb();
  await redisAdmin.quit();

  const shared = {
    DEVFLOW_DATABASE_URL: DB_URL,
    DEVFLOW_REDIS_URL: REDIS_URL,
    DEVFLOW_LOG_LEVEL: 'warn',
  };
  spawnApp('seed-api', `${ROOT}/apps/api`, 'src/server.ts', {
    ...shared,
    DEVFLOW_API_PORT: String(API_PORT),
    DEVFLOW_GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
    DEVFLOW_AUTH_SECRET: 'demo-seed-auth-secret-demo-seed-32ch',
    DEVFLOW_GITHUB_CLIENT_ID: 'demo-seed-client',
    DEVFLOW_GITHUB_CLIENT_SECRET: 'demo-seed-secret',
    DEVFLOW_GITHUB_APP_SLUG: 'devflow-demo-seed',
    DEVFLOW_APP_URL: `http://127.0.0.1:${API_PORT}`,
  });
  spawnApp('seed-worker', `${ROOT}/apps/worker`, 'src/main.ts', {
    ...shared,
    DEVFLOW_WORKER_PORT: String(WORKER_PORT),
    DEVFLOW_GITHUB_APP_ID: '770001',
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

  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();

  console.log(`seeding ${RUNS.length} runs into ${DB_URL} ...`);
  for (const run of RUNS) await deliverRun(run);

  const runIds = RUNS.map((r) => r.id);
  await poll('all runs processed', async () => {
    const done = await db.query(
      `SELECT count(*)::int AS n FROM workflow_runs
       WHERE github_run_id = ANY($1) AND processing_status = 'succeeded'`,
      [runIds],
    );
    return done.rows[0].n === RUNS.length;
  });
  check('all seeded runs processed', true, `${RUNS.length} runs`);

  const flaky = await db.query(
    `SELECT score, verdict FROM test_flake_scores WHERE test_name = 'retries_on_timeout'`,
  );
  check(
    'Checkout.retries_on_timeout is flaky (~0.53, ADR-0010 arithmetic)',
    flaky.rowCount === 1 &&
      flaky.rows[0].verdict === 'flaky' &&
      Math.abs(flaky.rows[0].score - 0.529) < 0.02,
    `score=${flaky.rows[0]?.score}`,
  );

  const suspected = await db.query(
    `SELECT score, verdict FROM test_flake_scores WHERE test_name = 'updates_quantity'`,
  );
  check(
    'Cart.updates_quantity is suspected (~0.46)',
    suspected.rowCount === 1 &&
      suspected.rows[0].verdict === 'suspected' &&
      Math.abs(suspected.rows[0].score - 0.464) < 0.02,
    `score=${suspected.rows[0]?.score}`,
  );

  const alwaysRed = await db.query(
    `SELECT score, verdict FROM test_flake_scores WHERE test_name = 'always_red'`,
  );
  check(
    'Legacy.always_red accumulates zero evidence (broken, not flaky)',
    alwaysRed.rowCount === 0 ||
      (alwaysRed.rows[0].verdict === 'healthy' && alwaysRed.rows[0].score === 0),
    alwaysRed.rowCount === 0 ? 'no score row' : `score=${alwaysRed.rows[0].score}`,
  );

  const embeddings = await db.query(`SELECT count(*)::int AS n FROM failure_embeddings`);
  check(
    'four distinct failure texts embedded for search/clusters',
    embeddings.rows[0].n >= 4,
    `n=${embeddings.rows[0].n}`,
  );

  // Attach the demo installation to the founder's workspace when one exists
  // (the signed-state claim flow is for real GitHub installs; demo data is
  // local by definition). Without a workspace the data stays unclaimed and
  // becomes visible after login + re-run.
  const ws = await db.query(`SELECT id, name FROM workspaces ORDER BY created_at LIMIT 1`);
  if ((ws.rowCount ?? 0) > 0) {
    await db.query(`UPDATE installations SET workspace_id = $1 WHERE github_installation_id = $2`, [
      ws.rows[0].id,
      INSTALLATION_ID,
    ]);
    check('demo installation attached to workspace', true, `"${ws.rows[0].name}"`);
  } else {
    console.log(
      'NOTE  no workspace yet — log in once (pnpm dev, GitHub login), then re-run pnpm demo:seed to attach the demo data',
    );
  }

  // Convergence: redeliver one run under its deterministic GUID (the repair
  // path) and confirm nothing duplicates.
  const before = (
    await db.query(
      `SELECT (SELECT count(*)::int FROM workflow_runs) AS runs,
              (SELECT count(*)::int FROM test_flake_scores) AS scores`,
    )
  ).rows[0];
  await deliverRun(RUNS[RUNS.length - 1]);
  await new Promise((r) => setTimeout(r, 4000));
  const after = (
    await db.query(
      `SELECT (SELECT count(*)::int FROM workflow_runs) AS runs,
              (SELECT count(*)::int FROM test_flake_scores) AS scores`,
    )
  ).rows[0];
  check(
    're-delivery converges (no duplicate runs or scores)',
    before.runs === after.runs && before.scores === after.scores,
  );

  await db.end();

  const redisCleanup = new Redis(REDIS_URL);
  await redisCleanup.flushdb();
  await redisCleanup.quit();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n=== demo:seed: ${results.length - failed.length}/${results.length} checks passed ===`,
  );
  if (failed.length === 0) {
    console.log(
      'Seeded. Start the product (pnpm dev, or the compose full profile), log in,\n' +
        'and the workspace shows two repositories, a flaky test with evidence, a\n' +
        'suspected one, a quarantine proposal to approve, and searchable failures.',
    );
  }
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error('demo:seed error:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    killAllSpawned();
    stub.close();
    setTimeout(() => process.exit(process.exitCode ?? 1), 2000);
  });
