import type { DbClient } from '@devflow/db/client';
import { testFlakeScores } from '@devflow/db/schema/flake-scores';
import { repositories, testResults, workflowRuns } from '@devflow/db/schema/runs';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { and, eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDetectionStage } from '../src/detection/detection-stage.js';
import { DETECTION_DEFAULTS } from '../src/detection/score.js';
import type { NormalizedRun } from '../src/pipeline/normalize-run.js';
import { createTestDb } from './helpers.js';

const log = pino({ level: 'silent' });
const DAY = 86_400_000;
const NOW = Date.now();

let client: DbClient;
let repositoryId: bigint;
let rawEventId: bigint;
let githubRunCounter = 500_000;

type SeededRun = { workflowRunId: bigint; githubRunId: bigint; runAttempt: number };

async function seedRun(spec: {
  headSha: string;
  headBranch: string;
  ageDays: number;
  githubRunId?: number;
  runAttempt?: number;
  results: { testName: string; status: string; suiteName?: string }[];
}): Promise<SeededRun> {
  const githubRunId = spec.githubRunId ?? ++githubRunCounter;
  const runAttempt = spec.runAttempt ?? 1;
  const rows = await client.db
    .insert(workflowRuns)
    .values({
      repositoryId,
      githubRunId: BigInt(githubRunId),
      runAttempt,
      rawEventId,
      headBranch: spec.headBranch,
      headSha: spec.headSha,
      runStartedAt: new Date(NOW - spec.ageDays * DAY),
      processingStatus: 'succeeded',
    })
    .returning({ id: workflowRuns.id });
  const workflowRunId = rows[0]!.id;
  await client.db.insert(testResults).values(
    spec.results.map((r) => ({
      workflowRunId,
      suiteName: r.suiteName ?? 'suite',
      className: 'Class',
      testName: r.testName,
      status: r.status,
    })),
  );
  return { workflowRunId, githubRunId: BigInt(githubRunId), runAttempt };
}

function normalizedRun(seeded: SeededRun, headSha: string): NormalizedRun {
  return {
    repositoryId,
    workflowRunId: seeded.workflowRunId,
    installationId: 1n,
    owner: 'annacrisstina',
    repo: 'flaky-playground',
    githubRunId: seeded.githubRunId,
    runAttempt: seeded.runAttempt,
    headSha,
    defaultBranch: 'main',
  };
}

async function scoreRow(testName: string) {
  const rows = await client.db
    .select()
    .from(testFlakeScores)
    .where(
      and(eq(testFlakeScores.repositoryId, repositoryId), eq(testFlakeScores.testName, testName)),
    );
  return rows;
}

beforeAll(async () => {
  client = await createTestDb('devflow_test_detection');
  const event = await client.db
    .insert(webhookEvents)
    .values({
      deliveryId: 'detection-guid-1',
      eventType: 'workflow_run',
      action: 'completed',
      payload: {},
    })
    .returning({ id: webhookEvents.id });
  rawEventId = event[0]!.id;
  const repo = await client.db
    .insert(repositories)
    .values({
      githubRepoId: 900100200n,
      installationId: 1n,
      owner: 'annacrisstina',
      name: 'flaky-playground',
      private: false,
      defaultBranch: 'main',
    })
    .returning({ id: repositories.id });
  repositoryId = repo[0]!.id;
});

afterAll(async () => {
  await client.close();
});

describe('detectionStage', () => {
  const stage = () => createDetectionStage({ db: client.db, detection: DETECTION_DEFAULTS });

  it('scores a failing test with a same-commit divergence in its history', async () => {
    // Yesterday on a PR branch: fail then pass on one sha (the re-run signal).
    const runId = ++githubRunCounter;
    await seedRun({
      headSha: 'sha-div',
      headBranch: 'feat/pr-1',
      ageDays: 1,
      githubRunId: runId,
      runAttempt: 1,
      results: [{ testName: 'flaky_login', status: 'failed' }],
    });
    await seedRun({
      headSha: 'sha-div',
      headBranch: 'feat/pr-1',
      ageDays: 1,
      githubRunId: runId,
      runAttempt: 2,
      results: [{ testName: 'flaky_login', status: 'passed' }],
    });
    // Today: the test fails again on a new sha of the same PR branch.
    const today = await seedRun({
      headSha: 'sha-today',
      headBranch: 'feat/pr-1',
      ageDays: 0,
      results: [{ testName: 'flaky_login', status: 'failed' }],
    });

    await stage()(normalizedRun(today, 'sha-today'), log);

    const rows = await scoreRow('flaky_login');
    expect(rows).toHaveLength(1);
    // One divergence ~1 day old: evidence = 2^(-1/14) ≈ 0.952 → score ≈ 0.322.
    expect(rows[0]!.verdict).toBe('suspected');
    expect(rows[0]!.score).toBeGreaterThan(0.3);
    expect(rows[0]!.score).toBeLessThan(1 / 3);
    expect(rows[0]!.divergenceEvidence).toBe(1);
    expect(rows[0]!.transitionEvidence).toBe(0);
    expect(rows[0]!.lastFailureAt).not.toBeNull();
  });

  it('recomputing is convergent: same run processed twice yields one row', async () => {
    const again = await seedRun({
      headSha: 'sha-today-2',
      headBranch: 'feat/pr-1',
      ageDays: 0,
      results: [{ testName: 'flaky_login', status: 'failed' }],
    });
    await stage()(normalizedRun(again, 'sha-today-2'), log);
    await stage()(normalizedRun(again, 'sha-today-2'), log);
    expect(await scoreRow('flaky_login')).toHaveLength(1);
  });

  it('decays a previously suspected test back to healthy when it keeps passing', async () => {
    await client.db.insert(testFlakeScores).values({
      repositoryId,
      suiteName: 'suite',
      className: 'Class',
      testName: 'recovered_test',
      score: 0.33,
      verdict: 'suspected',
      divergenceEvidence: 1,
      transitionEvidence: 0,
      lastFailureAt: new Date(NOW - 80 * DAY),
      computedAt: new Date(NOW - 80 * DAY),
    });
    // Its only surviving history: passes. It passes again in today's run.
    await seedRun({
      headSha: 'sha-old-pass',
      headBranch: 'main',
      ageDays: 20,
      results: [{ testName: 'recovered_test', status: 'passed' }],
    });
    const today = await seedRun({
      headSha: 'sha-new-pass',
      headBranch: 'main',
      ageDays: 0,
      results: [{ testName: 'recovered_test', status: 'passed' }],
    });

    await stage()(normalizedRun(today, 'sha-new-pass'), log);

    const rows = await scoreRow('recovered_test');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.verdict).toBe('healthy');
    expect(rows[0]!.score).toBe(0);
  });

  it('aggregates parameterized repeats to worst-status-per-run before scoring', async () => {
    // Same sha, two runs: run 1 has pass+fail rows for one identity (worst =
    // failed), run 2 has two passes (worst = passed) → exactly one divergence.
    await seedRun({
      headSha: 'sha-param',
      headBranch: 'feat/pr-2',
      ageDays: 0,
      results: [
        { testName: 'param_case', status: 'passed' },
        { testName: 'param_case', status: 'failed' },
      ],
    });
    await seedRun({
      headSha: 'sha-param',
      headBranch: 'feat/pr-2',
      ageDays: 0,
      results: [
        { testName: 'param_case', status: 'passed' },
        { testName: 'param_case', status: 'passed' },
      ],
    });
    const today = await seedRun({
      headSha: 'sha-param-2',
      headBranch: 'feat/pr-2',
      ageDays: 0,
      results: [{ testName: 'param_case', status: 'failed' }],
    });

    await stage()(normalizedRun(today, 'sha-param-2'), log);

    const rows = await scoreRow('param_case');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.divergenceEvidence).toBe(1);
  });

  it('leaves untouched identities alone: a passing test with no score gets none', async () => {
    const today = await seedRun({
      headSha: 'sha-quiet',
      headBranch: 'main',
      ageDays: 0,
      results: [{ testName: 'quiet_test', status: 'passed' }],
    });
    await stage()(normalizedRun(today, 'sha-quiet'), log);
    expect(await scoreRow('quiet_test')).toHaveLength(0);
  });
});
