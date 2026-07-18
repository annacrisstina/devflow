import type { Db } from '@devflow/db/client';
import { testFlakeScores } from '@devflow/db/schema/flake-scores';
import { testResults, workflowRuns } from '@devflow/db/schema/runs';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Logger } from 'pino';

import type { CheckRunParams, GitHubClient } from '../github/client.js';
import type { NormalizedRun } from '../pipeline/normalize-run.js';

export const CHECK_NAME = 'DevFlow flake report';

/** Checks API output has hard size limits; overflow is stated, not dropped silently. */
const MAX_LISTED_TESTS = 20;

export type AnnotationStageConfig = {
  db: Db;
  github: Pick<GitHubClient, 'createCheckRun' | 'updateCheckRun'>;
};

export type AnnotationStage = (run: NormalizedRun, log: Logger) => Promise<void>;

type FlaggedTest = {
  suiteName: string;
  className: string;
  testName: string;
  verdict: string;
  score: number;
  divergenceEvidence: number;
  transitionEvidence: number;
};

/**
 * Posts the advisory check run (ADR-0011). Only speaks when a failing test
 * holds a non-healthy verdict; always concludes 'neutral'; reprocessing
 * PATCHes the check recorded on workflow_runs.flake_check_run_id instead of
 * stacking a new one.
 */
export function createAnnotationStage(config: AnnotationStageConfig): AnnotationStage {
  return async function annotationStage(run: NormalizedRun, log: Logger): Promise<void> {
    const failing = await config.db
      .selectDistinct({
        suiteName: testResults.suiteName,
        className: testResults.className,
        testName: testResults.testName,
      })
      .from(testResults)
      .where(
        and(
          eq(testResults.workflowRunId, run.workflowRunId),
          inArray(testResults.status, ['failed', 'error']),
        ),
      );

    const flagged: FlaggedTest[] = [];
    if (failing.length > 0) {
      const scores = await config.db
        .select()
        .from(testFlakeScores)
        .where(
          and(
            eq(testFlakeScores.repositoryId, run.repositoryId),
            ne(testFlakeScores.verdict, 'healthy'),
          ),
        );
      const failingKeys = new Set(
        failing.map((f) => `${f.suiteName}\u0000${f.className}\u0000${f.testName}`),
      );
      for (const s of scores) {
        if (failingKeys.has(`${s.suiteName}\u0000${s.className}\u0000${s.testName}`)) {
          flagged.push(s);
        }
      }
    }

    const existingCheckRunId = (
      await config.db
        .select({ flakeCheckRunId: workflowRuns.flakeCheckRunId })
        .from(workflowRuns)
        .where(eq(workflowRuns.id, run.workflowRunId))
    )[0]?.flakeCheckRunId;

    if (flagged.length === 0) {
      // Silence is the normal no-news path; the PATCH-to-all-clear only
      // repairs a check left behind by a reprocess whose replaced results no
      // longer flag anything (ADR-0011).
      if (existingCheckRunId != null) {
        await config.github.updateCheckRun(
          run.installationId,
          run.owner,
          run.repo,
          existingCheckRunId,
          allClearCheck(failing.length),
        );
        log.info({ checkRunId: existingCheckRunId.toString() }, 'flake check cleared');
      }
      return;
    }

    const check = flakeReportCheck(flagged, failing.length);
    if (existingCheckRunId != null) {
      await config.github.updateCheckRun(
        run.installationId,
        run.owner,
        run.repo,
        existingCheckRunId,
        check,
      );
      log.info(
        { checkRunId: existingCheckRunId.toString(), flagged: flagged.length },
        'flake check updated',
      );
      return;
    }

    const checkRunId = await config.github.createCheckRun(
      run.installationId,
      run.owner,
      run.repo,
      run.headSha,
      check,
    );
    await config.db
      .update(workflowRuns)
      .set({ flakeCheckRunId: checkRunId })
      .where(eq(workflowRuns.id, run.workflowRunId));
    log.info({ checkRunId: checkRunId.toString(), flagged: flagged.length }, 'flake check created');
  };
}

function flakeReportCheck(flagged: FlaggedTest[], failingCount: number): CheckRunParams {
  const flaky = flagged.filter((t) => t.verdict === 'flaky').length;
  const suspected = flagged.length - flaky;
  const title = [
    flaky > 0 ? `${flaky} known-flaky` : null,
    suspected > 0 ? `${suspected} suspected-flaky` : null,
  ]
    .filter((part) => part !== null)
    .join(', ')
    .concat(` among ${failingCount} failing test${failingCount === 1 ? '' : 's'}`);

  const listed = [...flagged]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LISTED_TESTS)
    .map(
      (t) => `| \`${displayName(t)}\` | ${t.verdict} | ${t.score.toFixed(2)} | ${evidence(t)} |`,
    );

  const overflow =
    flagged.length > MAX_LISTED_TESTS
      ? `\n_…and ${flagged.length - MAX_LISTED_TESTS} more flagged tests not listed._\n`
      : '';

  const summary = [
    'These failing tests have a history of flaky behavior in this repository.',
    'The verdicts below are advisory — they never block a merge — and each one',
    'is explained by its evidence (ADR-0010: deterministic, no ML).',
    '',
    '| Test | Verdict | Score | Evidence |',
    '| --- | --- | --- | --- |',
    ...listed,
    overflow,
  ].join('\n');

  return { name: CHECK_NAME, conclusion: 'neutral', output: { title, summary } };
}

function allClearCheck(failingCount: number): CheckRunParams {
  return {
    name: CHECK_NAME,
    conclusion: 'neutral',
    output: {
      title: 'No known-flaky failures in this run',
      summary:
        failingCount === 0
          ? 'After reprocessing, this run has no failing tests.'
          : `After reprocessing, none of the ${failingCount} failing tests carry a flaky or suspected verdict.`,
    },
  };
}

function displayName(t: FlaggedTest): string {
  return [t.suiteName, t.className, t.testName].filter((part) => part !== '').join(' › ');
}

function evidence(t: FlaggedTest): string {
  const parts: string[] = [];
  if (t.divergenceEvidence > 0) {
    parts.push(
      `${t.divergenceEvidence} same-commit pass/fail divergence${t.divergenceEvidence === 1 ? '' : 's'}`,
    );
  }
  if (t.transitionEvidence > 0) {
    parts.push(
      `${t.transitionEvidence} default-branch transition${t.transitionEvidence === 1 ? '' : 's'}`,
    );
  }
  return parts.join('; ');
}
