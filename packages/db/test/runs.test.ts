import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DbClient } from '../src/client.js';
import { repositories, testResults, workflowRuns } from '../src/schema/runs.js';
import { webhookEvents } from '../src/schema/webhook-events.js';
import { createTestDb } from './helpers.js';

let client: DbClient;
let rawEventId: bigint;
let repositoryId: bigint;

beforeAll(async () => {
  client = await createTestDb('devflow_test_runs');
  const event = await client.db
    .insert(webhookEvents)
    .values({ deliveryId: 'runs-guid', eventType: 'workflow_run', payload: {} })
    .returning();
  rawEventId = event[0]!.id;
  const repo = await client.db
    .insert(repositories)
    .values({
      githubRepoId: 111n,
      installationId: 999n,
      owner: 'annacrisstina',
      name: 'devflow',
      private: false,
    })
    .returning();
  repositoryId = repo[0]!.id;
});

afterAll(async () => {
  await client.close();
});

describe('repositories', () => {
  it('upserts on the immutable GitHub id (rename survives)', async () => {
    const updated = await client.db
      .insert(repositories)
      .values({
        githubRepoId: 111n,
        installationId: 999n,
        owner: 'annacrisstina',
        name: 'devflow-renamed',
        private: true,
      })
      .onConflictDoUpdate({
        target: repositories.githubRepoId,
        set: { name: 'devflow-renamed', private: true },
      })
      .returning();

    expect(updated[0]?.id).toBe(repositoryId);
    expect(updated[0]?.name).toBe('devflow-renamed');
  });
});

describe('workflow_runs', () => {
  const baseRun = () => ({
    repositoryId,
    githubRunId: 5555n,
    runAttempt: 1,
    rawEventId,
    headSha: 'abc123',
    processingStatus: 'queued',
  });

  it('converges duplicate (run, attempt) via upsert', async () => {
    await client.db.insert(workflowRuns).values(baseRun());
    const second = await client.db
      .insert(workflowRuns)
      .values({ ...baseRun(), conclusion: 'failure' })
      .onConflictDoUpdate({
        target: [workflowRuns.githubRunId, workflowRuns.runAttempt],
        set: { conclusion: 'failure' },
      })
      .returning();

    expect(second[0]?.conclusion).toBe('failure');
    const rows = await client.db.execute(
      sql`SELECT count(*)::int AS n FROM workflow_runs WHERE github_run_id = 5555`,
    );
    expect(rows.rows[0]?.n).toBe(1);
  });

  it('stores retry attempts as separate rows (the M3 divergence signal)', async () => {
    await client.db.insert(workflowRuns).values({ ...baseRun(), runAttempt: 2 });
    const rows = await client.db.execute(
      sql`SELECT count(*)::int AS n FROM workflow_runs WHERE github_run_id = 5555`,
    );
    expect(rows.rows[0]?.n).toBe(2);
  });
});

describe('test_results', () => {
  it('allows duplicate test identities within a run (parameterized tests)', async () => {
    const run = await client.db
      .insert(workflowRuns)
      .values({
        repositoryId,
        githubRunId: 6666n,
        runAttempt: 1,
        rawEventId,
        headSha: 'def456',
      })
      .returning();
    const runId = run[0]!.id;

    const row = {
      workflowRunId: runId,
      suiteName: 'suite',
      className: 'Class',
      testName: 'test [param]',
      status: 'passed',
    };
    await client.db.insert(testResults).values([row, row]);

    const rows = await client.db.execute(
      sql`SELECT count(*)::int AS n FROM test_results WHERE workflow_run_id = ${runId}`,
    );
    expect(rows.rows[0]?.n).toBe(2);
  });
});
