import type { Db } from '@devflow/db/client';
import { testFlakeScores } from '@devflow/db/schema/flake-scores';
import { testResults, workflowRuns } from '@devflow/db/schema/runs';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Logger } from 'pino';

import type { NormalizedRun } from '../pipeline/normalize-run.js';
import { assessFlakiness, type DetectionConfig, type TestRunOutcome } from './score.js';

/**
 * Bounded history read (ADR-0010): at the default 14-day half-life, evidence
 * older than 90 days contributes <1% of its original weight — reading further
 * back changes nothing a threshold can see.
 */
const HISTORY_DAYS = 90;

/** Identity tuples per history query; recompute sets are usually far smaller. */
const IDENTITY_CHUNK = 100;

export type TestIdentity = { suiteName: string; className: string; testName: string };

export type DetectionStageConfig = {
  db: Db;
  detection: DetectionConfig;
};

export type DetectionStage = (run: NormalizedRun, log: Logger) => Promise<void>;

/**
 * Recomputes flake scores after a run's results persist (ADR-0010).
 * Recompute set = (identities that failed in this run) ∪ (identities in this
 * run currently holding a non-healthy score): the first makes scores rise,
 * the second lets recovered tests decay back toward healthy.
 *
 * Scores are derived data — concurrent recomputes of one identity are a
 * benign last-write-wins race, both writers having read committed history.
 */
export function createDetectionStage(config: DetectionStageConfig): DetectionStage {
  return async function detectionStage(run: NormalizedRun, log: Logger): Promise<void> {
    const now = new Date();
    const identities = await affectedIdentities(config.db, run);
    if (identities.length === 0) {
      log.info('no identities to assess');
      return;
    }

    const history = await loadHistory(config.db, run.repositoryId, identities, now);

    const verdictCounts = { healthy: 0, suspected: 0, flaky: 0 };
    for (const identity of identities) {
      const outcomes = history.get(identityKey(identity)) ?? [];
      const assessment = assessFlakiness(outcomes, run.defaultBranch, now, config.detection);
      verdictCounts[assessment.verdict] += 1;

      const row = {
        repositoryId: run.repositoryId,
        suiteName: identity.suiteName,
        className: identity.className,
        testName: identity.testName,
        score: assessment.score,
        verdict: assessment.verdict,
        divergenceEvidence: assessment.divergenceEvidence,
        transitionEvidence: assessment.transitionEvidence,
        lastFailureAt: assessment.lastFailureAt,
        computedAt: now,
      };
      await config.db
        .insert(testFlakeScores)
        .values(row)
        .onConflictDoUpdate({
          target: [
            testFlakeScores.repositoryId,
            testFlakeScores.suiteName,
            testFlakeScores.className,
            testFlakeScores.testName,
          ],
          set: row,
        });
    }

    log.info({ assessed: identities.length, ...verdictCounts }, 'flake scores recomputed');
  };
}

async function affectedIdentities(db: Db, run: NormalizedRun): Promise<TestIdentity[]> {
  const identityColumns = {
    suiteName: testResults.suiteName,
    className: testResults.className,
    testName: testResults.testName,
  };

  const failedNow = await db
    .selectDistinct(identityColumns)
    .from(testResults)
    .where(
      and(
        eq(testResults.workflowRunId, run.workflowRunId),
        inArray(testResults.status, ['failed', 'error']),
      ),
    );

  const nonHealthyPresent = await db
    .selectDistinct(identityColumns)
    .from(testResults)
    .innerJoin(
      testFlakeScores,
      and(
        eq(testFlakeScores.repositoryId, run.repositoryId),
        eq(testFlakeScores.suiteName, testResults.suiteName),
        eq(testFlakeScores.className, testResults.className),
        eq(testFlakeScores.testName, testResults.testName),
        ne(testFlakeScores.verdict, 'healthy'),
      ),
    )
    .where(
      and(eq(testResults.workflowRunId, run.workflowRunId), ne(testResults.status, 'skipped')),
    );

  const merged = new Map<string, TestIdentity>();
  for (const identity of [...failedNow, ...nonHealthyPresent]) {
    merged.set(identityKey(identity), identity);
  }
  return [...merged.values()];
}

/**
 * One bounded read per identity chunk: every non-skipped result of the
 * affected identities in this repository over the last HISTORY_DAYS, joined
 * to its run for chronology and sha. Parameterized repeats aggregate to
 * worst-status-per-run-attempt before scoring (ADR-0010).
 */
async function loadHistory(
  db: Db,
  repositoryId: bigint,
  identities: TestIdentity[],
  now: Date,
): Promise<Map<string, TestRunOutcome[]>> {
  const cutoff = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  // Chronology source: run_started_at, falling back to completed_at. A run
  // with neither cannot be ordered and contributes no evidence. Raw SQL
  // selections bypass drizzle's column mapping, so the driver hands back a
  // timestamp string — re-parsed below.
  const occurredAt = sql<string>`coalesce(${workflowRuns.runStartedAt}, ${workflowRuns.completedAt})`;

  // identity key -> run key -> aggregated outcome
  const perIdentity = new Map<string, Map<string, TestRunOutcome>>();

  for (let i = 0; i < identities.length; i += IDENTITY_CHUNK) {
    const chunk = identities.slice(i, i + IDENTITY_CHUNK);
    const tuples = sql.join(
      chunk.map((t) => sql`(${t.suiteName}, ${t.className}, ${t.testName})`),
      sql`, `,
    );

    const rows = await db
      .select({
        suiteName: testResults.suiteName,
        className: testResults.className,
        testName: testResults.testName,
        status: testResults.status,
        headSha: workflowRuns.headSha,
        githubRunId: workflowRuns.githubRunId,
        runAttempt: workflowRuns.runAttempt,
        headBranch: workflowRuns.headBranch,
        occurredAt,
      })
      .from(testResults)
      .innerJoin(workflowRuns, eq(workflowRuns.id, testResults.workflowRunId))
      .where(
        and(
          eq(workflowRuns.repositoryId, repositoryId),
          ne(testResults.status, 'skipped'),
          sql`${occurredAt} >= ${cutoff}`,
          sql`(${testResults.suiteName}, ${testResults.className}, ${testResults.testName}) in (${tuples})`,
        ),
      );

    for (const row of rows) {
      const key = identityKey(row);
      let runs = perIdentity.get(key);
      if (runs === undefined) {
        runs = new Map();
        perIdentity.set(key, runs);
      }
      const runKey = `${row.githubRunId}:${row.runAttempt}`;
      const failed = row.status === 'failed' || row.status === 'error';
      const existing = runs.get(runKey);
      if (existing === undefined) {
        runs.set(runKey, {
          runStartedAt: new Date(row.occurredAt),
          headSha: row.headSha,
          githubRunId: row.githubRunId,
          runAttempt: row.runAttempt,
          headBranch: row.headBranch,
          status: failed ? 'failed' : 'passed',
        });
      } else if (failed) {
        existing.status = 'failed';
      }
    }
  }

  const history = new Map<string, TestRunOutcome[]>();
  for (const [key, runs] of perIdentity) {
    history.set(key, [...runs.values()]);
  }
  return history;
}

function identityKey(identity: TestIdentity): string {
  // NUL separator: identity parts are free-form text and may contain any printable character.
  return `${identity.suiteName}\u0000${identity.className}\u0000${identity.testName}`;
}
