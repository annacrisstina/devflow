import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createDbClient } from '@devflow/db/client';
import { sessions, users } from '@devflow/db/schema/auth';
import { testFlakeScores } from '@devflow/db/schema/flake-scores';
import { repositories, testResults, workflowRuns } from '@devflow/db/schema/runs';
import { installations, workspaceMembers, workspaces } from '@devflow/db/schema/tenancy';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { effectiveScore } from '../src/flake/effective-score.js';
import { testConfig } from './test-config.js';

const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const TEST_DB = 'devflow_api_v1_test';

function withDatabase(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

const config = testConfig();
let app: Awaited<ReturnType<typeof buildApp>>;

const anaToken = randomUUID();
const malloryToken = randomUUID();
let ws1: bigint;
let ws2: bigint;
let repoA: bigint;
let freshScoreId: bigint;
let foreignScoreId: bigint;

const FRESH_SCORE = 0.6;
const STALE_SCORE = 0.5;
const STALE_AGE_DAYS = 28;
let staleComputedAt: Date;

function cookie(token: string) {
  return { cookie: `authjs.session-token=${token}` };
}

beforeAll(async () => {
  const admin = createDbClient(BASE_URL);
  await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`));
  await admin.db.execute(sql.raw(`CREATE DATABASE ${TEST_DB}`));
  await admin.close();

  const testDbUrl = withDatabase(BASE_URL, TEST_DB);
  const migrationClient = createDbClient(testDbUrl);
  await migrate(migrationClient.db, {
    migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)),
  });
  await migrationClient.close();

  app = await buildApp(testConfig({ databaseUrl: testDbUrl }));
  const db = app.db;

  // Two fully separate tenants: Ana(ws1 → installation 8001 → repoA) and
  // Mallory(ws2 → installation 8002 → repoB). Every denial test below is a
  // cross-tenant read attempted with Mallory's session against ws1.
  const [ana, mallory] = await db
    .insert(users)
    .values([{ name: 'Ana' }, { name: 'Mallory' }])
    .returning();
  const expires = new Date(Date.now() + 3_600_000);
  await db.insert(sessions).values([
    { sessionToken: anaToken, userId: ana!.id, expires },
    { sessionToken: malloryToken, userId: mallory!.id, expires },
  ]);

  const [w1, w2] = await db
    .insert(workspaces)
    .values([
      { name: 'Ana Space', createdBy: ana!.id },
      { name: 'Mallory Space', createdBy: mallory!.id },
    ])
    .returning();
  ws1 = w1!.id;
  ws2 = w2!.id;
  await db.insert(workspaceMembers).values([
    { workspaceId: ws1, userId: ana!.id, role: 'owner' },
    { workspaceId: ws2, userId: mallory!.id, role: 'owner' },
  ]);
  await db.insert(installations).values([
    { githubInstallationId: 8001n, workspaceId: ws1, accountLogin: 'annacrisstina' },
    { githubInstallationId: 8002n, workspaceId: ws2, accountLogin: 'mallory' },
  ]);

  const [rA, rB] = await db
    .insert(repositories)
    .values([
      {
        githubRepoId: 1n,
        installationId: 8001n,
        owner: 'annacrisstina',
        name: 'alpha',
        private: false,
        defaultBranch: 'main',
      },
      {
        githubRepoId: 2n,
        installationId: 8002n,
        owner: 'mallory',
        name: 'beta',
        private: true,
      },
    ])
    .returning();
  repoA = rA!.id;

  const [evt] = await db
    .insert(webhookEvents)
    .values({ deliveryId: 'v1-api-guid', eventType: 'workflow_run', payload: {} })
    .returning();

  const [run1, run2] = await db
    .insert(workflowRuns)
    .values([
      {
        repositoryId: repoA,
        githubRunId: 9001n,
        runAttempt: 1,
        rawEventId: evt!.id,
        headBranch: 'main',
        headSha: 'sha-a',
        conclusion: 'failure',
        processingStatus: 'succeeded',
        runStartedAt: new Date('2026-07-18T10:00:00Z'),
      },
      {
        repositoryId: repoA,
        githubRunId: 9001n,
        runAttempt: 2,
        rawEventId: evt!.id,
        headBranch: 'main',
        headSha: 'sha-a',
        conclusion: 'success',
        processingStatus: 'succeeded',
        runStartedAt: new Date('2026-07-18T10:30:00Z'),
      },
    ])
    .returning();

  await db.insert(testResults).values([
    {
      workflowRunId: run1!.id,
      suiteName: 'suite',
      className: 'Login',
      testName: 'retries flaky network',
      status: 'failed',
      failureMessage: 'timeout',
    },
    {
      workflowRunId: run1!.id,
      suiteName: 'suite',
      className: 'Other',
      testName: 'ok',
      status: 'passed',
    },
    {
      workflowRunId: run2!.id,
      suiteName: 'suite',
      className: 'Login',
      testName: 'retries flaky network',
      status: 'passed',
    },
  ]);

  staleComputedAt = new Date(Date.now() - STALE_AGE_DAYS * 86_400_000);
  const scores = await db
    .insert(testFlakeScores)
    .values([
      {
        repositoryId: repoA,
        suiteName: 'suite',
        className: 'Login',
        testName: 'retries flaky network',
        score: FRESH_SCORE,
        verdict: 'flaky',
        divergenceEvidence: 2,
        transitionEvidence: 1,
        lastFailureAt: new Date('2026-07-18T10:00:00Z'),
        computedAt: new Date(),
      },
      {
        repositoryId: repoA,
        suiteName: 'suite',
        className: 'Old',
        testName: 'stale flake',
        score: STALE_SCORE,
        verdict: 'flaky',
        divergenceEvidence: 2,
        transitionEvidence: 0,
        lastFailureAt: staleComputedAt,
        computedAt: staleComputedAt,
      },
      {
        repositoryId: rB!.id,
        suiteName: 's',
        className: 'C',
        testName: 'mallory test',
        score: 0.9,
        verdict: 'flaky',
        divergenceEvidence: 5,
        transitionEvidence: 0,
        lastFailureAt: new Date(),
        computedAt: new Date(),
      },
    ])
    .returning();
  freshScoreId = scores[0]!.id;
  foreignScoreId = scores[2]!.id;
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/v1/workspaces', () => {
  it('creates a workspace with the creator as owner', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: cookie(anaToken),
      payload: { name: 'Second Space' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Second Space', role: 'owner' });

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: cookie(anaToken) });
    expect(me.json().workspaces).toHaveLength(2);
  });

  it('rejects an empty name at the schema boundary', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: cookie(anaToken),
      payload: { name: '' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/v1/workspaces/:id', () => {
  it('returns detail with installations for a member', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.name).toBe('Ana Space');
    expect(body.installations).toHaveLength(1);
    expect(body.installations[0]).toMatchObject({
      githubInstallationId: '8001',
      accountLogin: 'annacrisstina',
    });
  });

  it('cross-tenant: non-member gets 404, not 403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}`,
      headers: cookie(malloryToken),
    });
    expect(response.statusCode).toBe(404);
  });

  it('unauthenticated gets 401', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/workspaces/${ws1}` });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/v1/workspaces/:id/repositories', () => {
  it('lists only the workspace tenancy chain', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/repositories`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ owner: 'annacrisstina', name: 'alpha' });
  });

  it('cross-tenant: 404 for non-members', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/repositories`,
      headers: cookie(malloryToken),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/v1/workspaces/:id/flaky-tests', () => {
  it('ranks by effective (decayed) score and never leaks other tenants', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/flaky-tests`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
    // Fresh 0.6 outranks stale 0.5-decayed-to-0.2; Mallory's 0.9 is absent.
    expect(body.items[0].testName).toBe('retries flaky network');
    expect(body.items[1].testName).toBe('stale flake');
    expect(body.items.map((i: { repository: string }) => i.repository)).not.toContain(
      'mallory/beta',
    );
  });

  it('SQL decay matches the TS reference implementation (ADR-0014)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/flaky-tests`,
      headers: cookie(anaToken),
    });
    const stale = response
      .json()
      .items.find((i: { testName: string }) => i.testName === 'stale flake');
    const expected = effectiveScore(STALE_SCORE, staleComputedAt, new Date(), config.flake);
    expect(stale.effectiveScore).toBeCloseTo(expected, 4);
    // Two half-lives: e 2 → 0.5, score 0.2 → healthy on read despite the
    // stored 'flaky' verdict. This is the M3 stale-score debt closing.
    expect(stale.effectiveScore).toBeCloseTo(0.2, 3);
    expect(stale.verdict).toBe('healthy');
  });

  it('verdict filter applies to the EFFECTIVE verdict', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/flaky-tests?verdict=flaky`,
      headers: cookie(anaToken),
    });
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.items[0].testName).toBe('retries flaky network');
  });

  it('paginates', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/flaky-tests?limit=1&offset=1`,
      headers: cookie(anaToken),
    });
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(2);
    expect(body.items[0].testName).toBe('stale flake');
  });

  it('cross-tenant: 404 for non-members', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/flaky-tests`,
      headers: cookie(malloryToken),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/v1/workspaces/:id/flaky-tests/:scoreId', () => {
  it('returns detail with outcome history', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/flaky-tests/${freshScoreId}`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.testName).toBe('retries flaky network');
    expect(body.history).toHaveLength(2);
    // Newest first: the passing attempt 2, then the failing attempt 1.
    expect(body.history[0]).toMatchObject({ runAttempt: 2, status: 'passed' });
    expect(body.history[1]).toMatchObject({
      runAttempt: 1,
      status: 'failed',
      failureMessage: 'timeout',
    });
  });

  it("cross-tenant: another workspace's scoreId is 404 through ws1", async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/flaky-tests/${foreignScoreId}`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(404);
  });

  it('a malformed scoreId is 404, not 500', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/flaky-tests/not-a-number`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/v1/workspaces/:id/runs', () => {
  it('lists runs newest-first with test counts', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/runs`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(2);
    expect(body.items[0]).toMatchObject({
      githubRunId: '9001',
      runAttempt: 2,
      repository: 'annacrisstina/alpha',
      totalTests: 1,
      failedTests: 0,
    });
    expect(body.items[1]).toMatchObject({ runAttempt: 1, totalTests: 2, failedTests: 1 });
  });

  it('cross-tenant: 404 for non-members', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/runs`,
      headers: cookie(malloryToken),
    });
    expect(response.statusCode).toBe(404);
  });
});
