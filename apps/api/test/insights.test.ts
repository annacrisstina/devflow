import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import type { Embedder } from '@devflow/ai/embedder';
import { createDbClient } from '@devflow/db/client';
import { failureEmbeddings } from '@devflow/db/schema/ai';
import { sessions, users } from '@devflow/db/schema/auth';
import { repositories, testResults, workflowRuns } from '@devflow/db/schema/runs';
import { installations, workspaceMembers, workspaces } from '@devflow/db/schema/tenancy';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { testConfig } from './test-config.js';

const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const TEST_DB = 'devflow_api_insights_test';

function withDatabase(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * Deterministic test embedder: a fixed vocabulary of directions so distances
 * are knowable. The real model's behavior is pinned in @devflow/ai's tests
 * and the e2e; this suite tests routing, scoping and SQL.
 */
const DIRECTIONS: Record<string, number> = {
  timeout: 0,
  gateway: 1,
  redis: 2,
  assertion: 3,
};
function testVector(text: string): number[] {
  const v = new Array(384).fill(0);
  for (const [word, dim] of Object.entries(DIRECTIONS)) {
    if (text.toLowerCase().includes(word)) v[dim] = 1;
  }
  if (v.every((x) => x === 0)) v[10] = 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}
const stubEmbedder: Embedder = {
  embed: async (texts) => texts.map((t) => Float32Array.from(testVector(t))),
};

let app: Awaited<ReturnType<typeof buildApp>>;
let disabledApp: Awaited<ReturnType<typeof buildApp>>;
const anaToken = randomUUID();
const malloryToken = randomUUID();
let ws1: bigint;
let repoA: bigint;
let repoB: bigint;

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

  app = await buildApp(testConfig({ databaseUrl: testDbUrl }), { embedder: stubEmbedder });
  const db = app.db;

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
  await db.insert(workspaceMembers).values([
    { workspaceId: ws1, userId: ana!.id, role: 'owner' },
    { workspaceId: w2!.id, userId: mallory!.id, role: 'owner' },
  ]);
  await db.insert(installations).values([
    { githubInstallationId: 9101n, workspaceId: ws1 },
    { githubInstallationId: 9102n, workspaceId: w2!.id },
  ]);
  const repos = await db
    .insert(repositories)
    .values([
      { githubRepoId: 31n, installationId: 9101n, owner: 'anna', name: 'alpha', private: false },
      { githubRepoId: 32n, installationId: 9102n, owner: 'mallory', name: 'beta', private: false },
    ])
    .returning();
  repoA = repos[0]!.id;
  repoB = repos[1]!.id;

  // Embeddings: two "timeout gateway" texts (same cluster), one "redis"
  // (own cluster), plus Mallory's — which must never leak into ws1.
  const seed = [
    { repositoryId: repoA, text: 'timeout waiting for gateway', hash: 'h-timeout-1' },
    { repositoryId: repoA, text: 'gateway timeout after 30s', hash: 'h-timeout-2' },
    { repositoryId: repoA, text: 'redis connection refused', hash: 'h-redis' },
    { repositoryId: repoB, text: 'timeout in mallory land', hash: 'h-mallory' },
  ];
  await db.insert(failureEmbeddings).values(
    seed.map((s) => ({
      repositoryId: s.repositoryId,
      contentHash: s.hash,
      snippet: s.text,
      embedding: testVector(s.text),
    })),
  );

  // Occurrences: h-timeout-1 hit twice by one test, h-redis once by another.
  const [evt] = await db
    .insert(webhookEvents)
    .values({ deliveryId: 'insights-guid', eventType: 'workflow_run', payload: {} })
    .returning();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      repositoryId: repoA,
      githubRunId: 40001n,
      runAttempt: 1,
      rawEventId: evt!.id,
      headSha: 'sha-i',
      processingStatus: 'succeeded',
      runStartedAt: new Date(),
    })
    .returning();
  await db.insert(testResults).values([
    {
      workflowRunId: run!.id,
      suiteName: 's',
      className: 'Checkout',
      testName: 'pays',
      status: 'failed',
      failureHash: 'h-timeout-1',
    },
    {
      workflowRunId: run!.id,
      suiteName: 's',
      className: 'Checkout',
      testName: 'pays',
      status: 'failed',
      failureHash: 'h-timeout-1',
    },
    {
      workflowRunId: run!.id,
      suiteName: 's',
      className: 'Cache',
      testName: 'warms',
      status: 'error',
      failureHash: 'h-redis',
    },
  ]);

  disabledApp = await buildApp(
    testConfig({
      databaseUrl: testDbUrl,
      ai: {
        embeddings: false,
        modelDir: undefined,
        clusterThreshold: 0.8,
        apiKey: undefined,
        model: 'claude-haiku-4-5',
        baseUrl: 'https://api.anthropic.com',
      },
    }),
  );
});

afterAll(async () => {
  await app.close();
  await disabledApp.close();
});

describe('GET /api/v1/me features', () => {
  it('reports search on and hypotheses off (no key configured)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: cookie(anaToken),
    });
    expect(response.json().features).toEqual({ aiSearch: true, aiHypotheses: false });
  });

  it('reports search off when embeddings are disabled', async () => {
    const response = await disabledApp.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: cookie(anaToken),
    });
    expect(response.json().features.aiSearch).toBe(false);
  });
});

describe('GET /api/v1/workspaces/:id/search', () => {
  it('ranks by cosine similarity and joins occurrences + affected tests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/search?q=${encodeURIComponent('gateway timeout')}`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(200);
    const items = response.json().items;
    // Both timeout+gateway snippets tie at similarity 1 under the stub
    // vocabulary; redis trails far behind.
    expect(items[0].similarity).toBeGreaterThan(0.99);
    expect(items[1].similarity).toBeGreaterThan(0.99);
    expect([items[0].snippet, items[1].snippet].sort()).toEqual([
      'gateway timeout after 30s',
      'timeout waiting for gateway',
    ]);
    const first = items.find(
      (i: { snippet: string }) => i.snippet === 'timeout waiting for gateway',
    );
    expect(first.occurrences).toBe(2);
    expect(first.affectedTests).toEqual(['s › Checkout › pays']);
    expect(items[2].snippet).toBe('redis connection refused');
    expect(items[2].similarity).toBeLessThan(0.5);
  });

  it('never returns other tenants: mallory snippets are absent from ws1', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/search?q=timeout`,
      headers: cookie(anaToken),
    });
    const snippets = response.json().items.map((i: { snippet: string }) => i.snippet);
    expect(snippets).not.toContain('timeout in mallory land');
  });

  it('cross-tenant: non-member gets 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/search?q=timeout`,
      headers: cookie(malloryToken),
    });
    expect(response.statusCode).toBe(404);
  });

  it('answers 501 ai_disabled when embeddings are off', async () => {
    const response = await disabledApp.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/search?q=timeout`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(501);
    expect(response.json().error.code).toBe('ai_disabled');
  });
});

describe('GET /api/v1/workspaces/:id/repositories/:repoId/failure-clusters', () => {
  it('groups similar texts, ranks by occurrences, lists affected tests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/repositories/${repoA}/failure-clusters`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(200);
    const clusters = response.json().clusters;
    expect(clusters).toHaveLength(2);
    // Timeout cluster: 2 distinct texts, 2 recorded occurrences (h-timeout-1
    // twice; h-timeout-2 has no recorded rows → weight defaults to 1 → 3).
    expect(clusters[0].distinctFailures).toBe(2);
    expect(clusters[0].occurrences).toBe(3);
    expect(clusters[0].affectedTests).toContain('s › Checkout › pays');
    expect(clusters[1]).toMatchObject({
      representativeSnippet: 'redis connection refused',
      distinctFailures: 1,
      occurrences: 1,
    });
  });

  it("cross-tenant: another workspace's repo id is 404 through ws1", async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/repositories/${repoB}/failure-clusters`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(404);
  });

  it('respects the day window', async () => {
    await app.db
      .update(failureEmbeddings)
      .set({ lastSeenAt: new Date(Date.now() - 30 * 86_400_000) })
      .where(sql`content_hash = 'h-redis'`);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/repositories/${repoA}/failure-clusters?days=7`,
      headers: cookie(anaToken),
    });
    expect(response.json().clusters).toHaveLength(1);
  });
});
