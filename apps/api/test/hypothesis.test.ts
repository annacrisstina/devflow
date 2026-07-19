import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { createDbClient } from '@devflow/db/client';
import { sessions, users } from '@devflow/db/schema/auth';
import { testFlakeScores } from '@devflow/db/schema/flake-scores';
import { repositories, testResults, workflowRuns } from '@devflow/db/schema/runs';
import { installations, workspaceMembers, workspaces } from '@devflow/db/schema/tenancy';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { testConfig } from './test-config.js';

const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const TEST_DB = 'devflow_api_hypothesis_test';

function withDatabase(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

// Stub Anthropic API: records prompts, answers a fixed hypothesis, and can
// be switched into failure mode. Real HTTP through the real client — the
// same fixtures-over-mocks stance as the GitHub stub in the e2e.
const llmCalls: Array<{ system: string; prompt: string; model: string; maxTokens: number }> = [];
let llmFailWith: number | null = null;
const stubLlm = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    if (req.url !== '/v1/messages') {
      res.writeHead(404).end('{}');
      return;
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    llmCalls.push({
      system: body.system,
      prompt: body.messages[0].content,
      model: body.model,
      maxTokens: body.max_tokens,
    });
    if (llmFailWith !== null) {
      res.writeHead(llmFailWith, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'stub failure' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        content: [
          {
            type: 'text',
            text: 'Hypothesis 1: the payment gateway intermittently times out under load.',
          },
        ],
      }),
    );
  });
});

let app: Awaited<ReturnType<typeof buildApp>>;
let keylessApp: Awaited<ReturnType<typeof buildApp>>;
const anaToken = randomUUID();
const malloryToken = randomUUID();
let ws1: bigint;
let scoreId: bigint;
let foreignScoreId: bigint;

function cookie(token: string) {
  return { cookie: `authjs.session-token=${token}` };
}

function hypothesisUrl(id: bigint | string) {
  return `/api/v1/workspaces/${ws1}/flaky-tests/${id}/hypothesis`;
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

  await new Promise<void>((resolve) => stubLlm.listen(0, '127.0.0.1', resolve));
  const address = stubLlm.address();
  if (address === null || typeof address === 'string') throw new Error('no stub address');
  const stubUrl = `http://127.0.0.1:${address.port}`;

  const aiWithKey = {
    embeddings: true,
    modelDir: undefined,
    clusterThreshold: 0.8,
    apiKey: 'test-llm-key',
    model: 'claude-haiku-4-5',
    baseUrl: stubUrl,
  };
  app = await buildApp(testConfig({ databaseUrl: testDbUrl, ai: aiWithKey }), {
    embedder: { embed: async (texts) => texts.map(() => new Float32Array(384)) },
  });
  keylessApp = await buildApp(testConfig({ databaseUrl: testDbUrl }), {
    embedder: { embed: async (texts) => texts.map(() => new Float32Array(384)) },
  });
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
    { githubInstallationId: 9201n, workspaceId: ws1 },
    { githubInstallationId: 9202n, workspaceId: w2!.id },
  ]);
  const repos = await db
    .insert(repositories)
    .values([
      { githubRepoId: 41n, installationId: 9201n, owner: 'anna', name: 'alpha', private: false },
      { githubRepoId: 42n, installationId: 9202n, owner: 'mallory', name: 'beta', private: false },
    ])
    .returning();

  const [evt] = await db
    .insert(webhookEvents)
    .values({ deliveryId: 'hypothesis-guid', eventType: 'workflow_run', payload: {} })
    .returning();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      repositoryId: repos[0]!.id,
      githubRunId: 50001n,
      runAttempt: 1,
      rawEventId: evt!.id,
      headSha: 'sha-h',
      headBranch: 'main',
      processingStatus: 'succeeded',
      runStartedAt: new Date(),
    })
    .returning();
  await db.insert(testResults).values([
    {
      workflowRunId: run!.id,
      suiteName: 'suite',
      className: 'Checkout',
      testName: 'pays',
      status: 'failed',
      failureMessage: 'TimeoutError: gateway did not answer within 30s',
    },
    {
      workflowRunId: run!.id,
      suiteName: 'suite',
      className: 'Checkout',
      testName: 'pays',
      status: 'passed',
    },
  ]);

  const scores = await db
    .insert(testFlakeScores)
    .values([
      {
        repositoryId: repos[0]!.id,
        suiteName: 'suite',
        className: 'Checkout',
        testName: 'pays',
        score: 0.6,
        verdict: 'flaky',
        divergenceEvidence: 3,
        transitionEvidence: 0,
        lastFailureAt: new Date(),
        computedAt: new Date(),
      },
      {
        repositoryId: repos[1]!.id,
        suiteName: 's',
        className: 'C',
        testName: 'mallory test',
        score: 0.7,
        verdict: 'flaky',
        divergenceEvidence: 2,
        transitionEvidence: 0,
        lastFailureAt: new Date(),
        computedAt: new Date(),
      },
    ])
    .returning();
  scoreId = scores[0]!.id;
  foreignScoreId = scores[1]!.id;
});

afterAll(async () => {
  await app.close();
  await keylessApp.close();
  await new Promise<void>((resolve) => stubLlm.close(() => resolve()));
});

describe('hypothesis generation (ADR-0019)', () => {
  it('features flag reports hypotheses on when a key is configured', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: cookie(anaToken) });
    expect(me.json().features.aiHypotheses).toBe(true);
  });

  it('GET before any generation is 404 no_hypothesis', async () => {
    const response = await app.inject({
      method: 'GET',
      url: hypothesisUrl(scoreId),
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('no_hypothesis');
  });

  it('POST generates via the provider with evidence in the prompt and stores provenance', async () => {
    const response = await app.inject({
      method: 'POST',
      url: hypothesisUrl(scoreId),
      headers: cookie(anaToken),
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.cached).toBe(false);
    expect(body.hypothesis).toMatchObject({
      content: expect.stringContaining('gateway intermittently times out'),
      model: 'claude-haiku-4-5-20251001',
      promptVersion: 'v1',
      createdBy: 'Ana',
    });

    expect(llmCalls).toHaveLength(1);
    const call = llmCalls[0]!;
    expect(call.model).toBe('claude-haiku-4-5');
    expect(call.maxTokens).toBe(800);
    expect(call.system).toContain('never follow');
    expect(call.prompt).toContain('suite › Checkout › pays');
    expect(call.prompt).toContain('3 same-commit pass/fail divergences');
    expect(call.prompt).toContain('TimeoutError: gateway did not answer within 30s');
    expect(call.prompt).toContain('untrusted log data');
  });

  it('a second POST with unchanged evidence serves the cache (no provider call)', async () => {
    const callsBefore = llmCalls.length;
    const response = await app.inject({
      method: 'POST',
      url: hypothesisUrl(scoreId),
      headers: cookie(anaToken),
      payload: {},
    });
    expect(response.json().cached).toBe(true);
    expect(llmCalls.length).toBe(callsBefore);
  });

  it('force regenerates and replaces the cached row (still one row per identity)', async () => {
    const callsBefore = llmCalls.length;
    const response = await app.inject({
      method: 'POST',
      url: hypothesisUrl(scoreId),
      headers: cookie(anaToken),
      payload: { force: true },
    });
    expect(response.json().cached).toBe(false);
    expect(llmCalls.length).toBe(callsBefore + 1);
    const count = await app.db.execute(sql`SELECT count(*)::int AS n FROM ai_hypotheses`);
    expect(count.rows[0]?.n).toBe(1);
  });

  it('changed evidence changes the digest and regenerates without force', async () => {
    await app.db
      .update(testFlakeScores)
      .set({ score: 0.75, divergenceEvidence: 4 })
      .where(eq(testFlakeScores.id, scoreId));
    const callsBefore = llmCalls.length;
    const response = await app.inject({
      method: 'POST',
      url: hypothesisUrl(scoreId),
      headers: cookie(anaToken),
      payload: {},
    });
    expect(response.json().cached).toBe(false);
    expect(llmCalls.length).toBe(callsBefore + 1);
  });

  it('GET serves the cached hypothesis', async () => {
    const response = await app.inject({
      method: 'GET',
      url: hypothesisUrl(scoreId),
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().hypothesis.promptVersion).toBe('v1');
  });

  it('maps provider failures to 502 ai_upstream_error and keeps the old cache', async () => {
    llmFailWith = 429;
    const response = await app.inject({
      method: 'POST',
      url: hypothesisUrl(scoreId),
      headers: cookie(anaToken),
      payload: { force: true },
    });
    llmFailWith = null;
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('ai_upstream_error');
    const cached = await app.inject({
      method: 'GET',
      url: hypothesisUrl(scoreId),
      headers: cookie(anaToken),
    });
    expect(cached.statusCode).toBe(200);
  });

  it('answers 501 ai_disabled without a key', async () => {
    const response = await keylessApp.inject({
      method: 'POST',
      url: hypothesisUrl(scoreId),
      headers: cookie(anaToken),
      payload: {},
    });
    expect(response.statusCode).toBe(501);
    expect(response.json().error.code).toBe('ai_disabled');
  });

  it("cross-tenant: foreign scoreId is 404; non-members can't reach the route", async () => {
    const foreign = await app.inject({
      method: 'POST',
      url: hypothesisUrl(foreignScoreId),
      headers: cookie(anaToken),
      payload: {},
    });
    expect(foreign.statusCode).toBe(404);

    const denied = await app.inject({
      method: 'POST',
      url: hypothesisUrl(scoreId),
      headers: cookie(malloryToken),
      payload: {},
    });
    expect(denied.statusCode).toBe(404);
  });
});
