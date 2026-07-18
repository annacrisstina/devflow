import type { DbClient } from '@devflow/db/client';
import { testFlakeScores } from '@devflow/db/schema/flake-scores';
import { repositories, testResults, workflowRuns } from '@devflow/db/schema/runs';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CHECK_NAME, createAnnotationStage } from '../src/annotation/annotation-stage.js';
import type { CheckRunParams } from '../src/github/client.js';
import type { NormalizedRun } from '../src/pipeline/normalize-run.js';
import { createTestDb } from './helpers.js';

const log = pino({ level: 'silent' });

let client: DbClient;
let repositoryId: bigint;
let rawEventId: bigint;
let githubRunCounter = 700_000;

type RecordedCreate = { headSha: string; params: CheckRunParams };
type RecordedUpdate = { checkRunId: bigint; params: CheckRunParams };

let created: RecordedCreate[];
let updated: RecordedUpdate[];

const github = {
  createCheckRun: async (
    _installationId: bigint,
    _owner: string,
    _repo: string,
    headSha: string,
    params: CheckRunParams,
  ): Promise<bigint> => {
    created.push({ headSha, params });
    return BigInt(424_000 + created.length);
  },
  updateCheckRun: async (
    _installationId: bigint,
    _owner: string,
    _repo: string,
    checkRunId: bigint,
    params: CheckRunParams,
  ): Promise<void> => {
    updated.push({ checkRunId, params });
  },
};

async function seedRun(results: { testName: string; status: string }[]): Promise<NormalizedRun> {
  const githubRunId = ++githubRunCounter;
  const rows = await client.db
    .insert(workflowRuns)
    .values({
      repositoryId,
      githubRunId: BigInt(githubRunId),
      runAttempt: 1,
      rawEventId,
      headBranch: 'feat/pr',
      headSha: `sha-${githubRunId}`,
      runStartedAt: new Date(),
      processingStatus: 'succeeded',
    })
    .returning({ id: workflowRuns.id });
  const workflowRunId = rows[0]!.id;
  if (results.length > 0) {
    await client.db.insert(testResults).values(
      results.map((r) => ({
        workflowRunId,
        suiteName: 'suite',
        className: 'Class',
        testName: r.testName,
        status: r.status,
      })),
    );
  }
  return {
    repositoryId,
    workflowRunId,
    installationId: 1n,
    owner: 'annacrisstina',
    repo: 'flaky-playground',
    githubRunId: BigInt(githubRunId),
    runAttempt: 1,
    headSha: `sha-${githubRunId}`,
    defaultBranch: 'main',
  };
}

async function seedScore(testName: string, verdict: string, score: number): Promise<void> {
  await client.db.insert(testFlakeScores).values({
    repositoryId,
    suiteName: 'suite',
    className: 'Class',
    testName,
    score,
    verdict,
    divergenceEvidence: 2,
    transitionEvidence: 1,
    lastFailureAt: new Date(),
    computedAt: new Date(),
  });
}

beforeAll(async () => {
  client = await createTestDb('devflow_test_annotation');
  const event = await client.db
    .insert(webhookEvents)
    .values({
      deliveryId: 'annotation-guid-1',
      eventType: 'workflow_run',
      action: 'completed',
      payload: {},
    })
    .returning({ id: webhookEvents.id });
  rawEventId = event[0]!.id;
  const repo = await client.db
    .insert(repositories)
    .values({
      githubRepoId: 900100300n,
      installationId: 1n,
      owner: 'annacrisstina',
      name: 'flaky-playground',
      private: false,
      defaultBranch: 'main',
    })
    .returning({ id: repositories.id });
  repositoryId = repo[0]!.id;
});

beforeEach(() => {
  created = [];
  updated = [];
});

afterAll(async () => {
  await client.close();
});

describe('annotationStage', () => {
  const stage = () => createAnnotationStage({ db: client.db, github });

  it('creates a neutral check naming known-flaky failures and stores the check id', async () => {
    await seedScore('flaky_checkout', 'flaky', 0.61);
    const run = await seedRun([
      { testName: 'flaky_checkout', status: 'failed' },
      { testName: 'honest_failure', status: 'failed' },
      { testName: 'fine_test', status: 'passed' },
    ]);

    await stage()(run, log);

    expect(created).toHaveLength(1);
    expect(updated).toHaveLength(0);
    expect(created[0]!.headSha).toBe(run.headSha);
    expect(created[0]!.params.name).toBe(CHECK_NAME);
    expect(created[0]!.params.conclusion).toBe('neutral');
    expect(created[0]!.params.output.title).toBe('1 known-flaky among 2 failing tests');
    expect(created[0]!.params.output.summary).toContain('flaky_checkout');
    expect(created[0]!.params.output.summary).toContain('2 same-commit pass/fail divergences');
    // The honestly-failing test must NOT be named as flaky.
    expect(created[0]!.params.output.summary).not.toContain('honest_failure');

    const row = await client.db
      .select({ flakeCheckRunId: workflowRuns.flakeCheckRunId })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, run.workflowRunId));
    expect(row[0]!.flakeCheckRunId).not.toBeNull();
  });

  it('reprocessing PATCHes the recorded check instead of creating another', async () => {
    await seedScore('flaky_search', 'suspected', 0.3);
    const run = await seedRun([{ testName: 'flaky_search', status: 'failed' }]);

    await stage()(run, log);
    await stage()(run, log);

    expect(created).toHaveLength(1);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.checkRunId).toBe(424_001n);
    expect(updated[0]!.params.output.title).toBe('1 suspected-flaky among 1 failing test');
  });

  it('stays silent when failures carry no non-healthy verdict', async () => {
    const run = await seedRun([{ testName: 'brand_new_failure', status: 'failed' }]);
    await stage()(run, log);
    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it('stays silent on fully passing runs', async () => {
    const run = await seedRun([{ testName: 'green_test', status: 'passed' }]);
    await stage()(run, log);
    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it('clears an existing check when a reprocess no longer flags anything', async () => {
    const run = await seedRun([{ testName: 'green_after_refetch', status: 'passed' }]);
    await client.db
      .update(workflowRuns)
      .set({ flakeCheckRunId: 555_000n })
      .where(eq(workflowRuns.id, run.workflowRunId));

    await stage()(run, log);

    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.checkRunId).toBe(555_000n);
    expect(updated[0]!.params.output.title).toBe('No known-flaky failures in this run');
  });
});
