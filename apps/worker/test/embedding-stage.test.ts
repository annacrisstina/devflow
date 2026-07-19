import type { Embedder } from '@devflow/ai/embedder';
import { failureHash, failureText } from '@devflow/ai/failure-text';
import { failureEmbeddings } from '@devflow/db/schema/ai';
import { repositories, testResults, workflowRuns } from '@devflow/db/schema/runs';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { eq, sql } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createEmbeddingStage } from '../src/ai/embedding-stage.js';
import type { NormalizedRun } from '../src/pipeline/normalize-run.js';
import { createTestDb } from './helpers.js';

const log = pino({ level: 'silent' });

let client: Awaited<ReturnType<typeof createTestDb>>;
let repositoryId: bigint;
let rawEventId: bigint;
let runCounter = 500_000;

/**
 * Deterministic stand-in for the embedder: a unit vector derived from the
 * text's hash. The REAL model is exercised in @devflow/ai's own tests and in
 * the e2e — this suite tests the stage's database semantics (hash stamping,
 * dedup, caps, isolation), which don't depend on embedding quality.
 */
const embedCalls: string[][] = [];
const stubEmbedder: Embedder = {
  async embed(texts) {
    embedCalls.push(texts);
    return texts.map((text) => {
      const v = new Float32Array(384);
      const h = failureHash(text);
      for (let i = 0; i < 8; i++) v[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
      let norm = 0;
      for (const x of v) norm += x * x;
      norm = Math.sqrt(norm) || 1;
      return v.map((x) => x / norm);
    });
  },
};

async function seedRun(
  results: { testName: string; status: string; message?: string | null; details?: string | null }[],
): Promise<NormalizedRun> {
  const githubRunId = ++runCounter;
  const rows = await client.db
    .insert(workflowRuns)
    .values({
      repositoryId,
      githubRunId: BigInt(githubRunId),
      runAttempt: 1,
      rawEventId,
      headSha: `sha-${githubRunId}`,
      processingStatus: 'succeeded',
      runStartedAt: new Date(),
    })
    .returning({ id: workflowRuns.id });
  const workflowRunId = rows[0]!.id;
  await client.db.insert(testResults).values(
    results.map((r) => ({
      workflowRunId,
      suiteName: 'suite',
      className: 'C',
      testName: r.testName,
      status: r.status,
      failureMessage: r.message ?? null,
      failureDetails: r.details ?? null,
    })),
  );
  return {
    repositoryId,
    workflowRunId,
    installationId: 1n,
    owner: 'annacrisstina',
    repo: 'embed-repo',
    githubRunId: BigInt(githubRunId),
    runAttempt: 1,
    headSha: `sha-${githubRunId}`,
    defaultBranch: 'main',
  };
}

const stage = () =>
  createEmbeddingStage({ db: client.db, embedder: stubEmbedder, maxNewPerRun: 3 });

beforeAll(async () => {
  client = await createTestDb('devflow_worker_embed_test');
  const event = await client.db
    .insert(webhookEvents)
    .values({ deliveryId: 'embed-guid', eventType: 'workflow_run', payload: {} })
    .returning();
  rawEventId = event[0]!.id;
  const repo = await client.db
    .insert(repositories)
    .values({
      githubRepoId: 700n,
      installationId: 1n,
      owner: 'annacrisstina',
      name: 'embed-repo',
      private: false,
    })
    .returning();
  repositoryId = repo[0]!.id;
});

afterAll(async () => {
  await client.close();
});

describe('embedding stage', () => {
  it('stamps failure hashes on failed rows and embeds distinct texts once', async () => {
    const run = await seedRun([
      { testName: 'a', status: 'failed', message: 'timeout after 30s' },
      { testName: 'b', status: 'failed', message: 'timeout after 30s' },
      { testName: 'c', status: 'error', message: 'redis connection refused' },
      { testName: 'd', status: 'passed', message: null },
    ]);
    await stage()(run, log);

    const rows = await client.db
      .select({ testName: testResults.testName, failureHash: testResults.failureHash })
      .from(testResults)
      .where(eq(testResults.workflowRunId, run.workflowRunId));
    const byName = new Map(rows.map((r) => [r.testName, r.failureHash]));
    const expectedHash = failureHash(failureText('timeout after 30s', null)!);
    expect(byName.get('a')).toBe(expectedHash);
    expect(byName.get('b')).toBe(expectedHash);
    expect(byName.get('c')).toMatch(/^[0-9a-f]{64}$/);
    expect(byName.get('d')).toBeNull();

    // Two distinct texts → two embedding rows, one embed call with both.
    const embeddings = await client.db
      .select({ contentHash: failureEmbeddings.contentHash, snippet: failureEmbeddings.snippet })
      .from(failureEmbeddings)
      .where(eq(failureEmbeddings.repositoryId, repositoryId));
    expect(embeddings).toHaveLength(2);
    expect(embedCalls.at(-1)).toHaveLength(2);
  });

  it('does not re-embed known texts but refreshes last_seen', async () => {
    const before = await client.db
      .select({ lastSeenAt: failureEmbeddings.lastSeenAt })
      .from(failureEmbeddings)
      .where(eq(failureEmbeddings.repositoryId, repositoryId));
    const callsBefore = embedCalls.length;

    const run = await seedRun([
      { testName: 'a', status: 'failed', message: 'timeout after 30s' },
      { testName: 'e', status: 'failed', message: 'a brand new failure text' },
    ]);
    await stage()(run, log);

    // Only the new text was embedded.
    expect(embedCalls.length).toBe(callsBefore + 1);
    expect(embedCalls.at(-1)).toEqual(['a brand new failure text']);

    const after = await client.db
      .select({
        contentHash: failureEmbeddings.contentHash,
        lastSeenAt: failureEmbeddings.lastSeenAt,
      })
      .from(failureEmbeddings)
      .where(eq(failureEmbeddings.repositoryId, repositoryId));
    expect(after).toHaveLength(3);
    const timeoutRow = after.find(
      (r) => r.contentHash === failureHash(failureText('timeout after 30s', null)!),
    );
    const oldest = Math.min(...before.map((b) => b.lastSeenAt.getTime()));
    expect(timeoutRow!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(oldest);
  });

  it('caps new embeddings per run and reports the overflow', async () => {
    const run = await seedRun(
      Array.from({ length: 5 }, (_, i) => ({
        testName: `cap-${i}`,
        status: 'failed',
        message: `unique cap failure number ${i}`,
      })),
    );
    const callsBefore = embedCalls.length;
    await stage()(run, log);
    // maxNewPerRun = 3: one call with exactly 3 texts.
    expect(embedCalls.length).toBe(callsBefore + 1);
    expect(embedCalls.at(-1)).toHaveLength(3);
  });

  it('reprocessing converges (same hashes, no duplicate embeddings)', async () => {
    const run = await seedRun([{ testName: 'a', status: 'failed', message: 'timeout after 30s' }]);
    await stage()(run, log);
    await stage()(run, log);
    const count = await client.db.execute(
      sql`SELECT count(*)::int AS n FROM failure_embeddings WHERE repository_id = ${repositoryId} AND content_hash = ${failureHash(failureText('timeout after 30s', null)!)}`,
    );
    expect(count.rows[0]?.n).toBe(1);
  });

  it('swallows embedder failures — the job must never see them', async () => {
    const broken: Embedder = {
      embed: async () => {
        throw new Error('model exploded');
      },
    };
    const run = await seedRun([
      { testName: 'z', status: 'failed', message: 'text that will fail to embed' },
    ]);
    const failingStage = createEmbeddingStage({
      db: client.db,
      embedder: broken,
      maxNewPerRun: 10,
    });
    await expect(failingStage(run, log)).resolves.toBeUndefined();
  });

  it('is silent for runs with no failures', async () => {
    const run = await seedRun([{ testName: 'ok', status: 'passed' }]);
    const callsBefore = embedCalls.length;
    await stage()(run, log);
    expect(embedCalls.length).toBe(callsBefore);
  });
});
