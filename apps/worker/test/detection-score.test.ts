import { describe, expect, it } from 'vitest';

import {
  assessFlakiness,
  DETECTION_DEFAULTS,
  type TestRunOutcome,
} from '../src/detection/score.js';

const NOW = new Date('2026-07-18T12:00:00Z');
const DAY = 86_400_000;

let runCounter = 1000n;

function outcome(
  partial: Partial<TestRunOutcome> & { status: TestRunOutcome['status'] },
): TestRunOutcome {
  return {
    runStartedAt: NOW,
    headSha: 'sha-default',
    githubRunId: partial.githubRunId ?? ++runCounter,
    runAttempt: 1,
    headBranch: 'main',
    ...partial,
  };
}

/**
 * fail then pass on one sha (a re-run divergence), at a given age in days.
 * On a PR branch on purpose: divergence is branch-agnostic, and staying off
 * the default branch keeps the transition signal inert so tests measure one
 * signal at a time (adjacent divergence pairs on main would legitimately
 * also register a cross-sha transition).
 */
function divergencePair(sha: string, ageDays: number): TestRunOutcome[] {
  const runId = ++runCounter;
  const at = new Date(NOW.getTime() - ageDays * DAY);
  return [
    outcome({
      status: 'failed',
      headSha: sha,
      githubRunId: runId,
      runAttempt: 1,
      runStartedAt: at,
      headBranch: 'feat/some-pr',
    }),
    outcome({
      status: 'passed',
      headSha: sha,
      githubRunId: runId,
      runAttempt: 2,
      runStartedAt: at,
      headBranch: 'feat/some-pr',
    }),
  ];
}

describe('assessFlakiness', () => {
  it('scores zero with no history (cold start is safe)', () => {
    const result = assessFlakiness([], 'main', NOW);
    expect(result.score).toBe(0);
    expect(result.verdict).toBe('healthy');
  });

  it('gives a consistently failing test ZERO evidence — broken is not flaky', () => {
    const history = [0, 1, 2, 3].map((d) =>
      outcome({
        status: 'failed',
        headSha: `sha-${d}`,
        runStartedAt: new Date(NOW.getTime() - d * DAY),
      }),
    );
    const result = assessFlakiness(history, 'main', NOW);
    expect(result.score).toBe(0);
    expect(result.verdict).toBe('healthy');
    expect(result.lastFailureAt).toEqual(NOW);
  });

  it('one same-commit divergence today → score 1/3, suspected (the ADR example)', () => {
    const result = assessFlakiness(divergencePair('sha-a', 0), 'main', NOW);
    expect(result.score).toBeCloseTo(1 / 3, 5);
    expect(result.verdict).toBe('suspected');
    expect(result.divergenceEvidence).toBe(1);
  });

  it('two same-commit divergences today → score 0.5, flaky (the ADR example)', () => {
    const history = [...divergencePair('sha-a', 0), ...divergencePair('sha-b', 0)];
    const result = assessFlakiness(history, 'main', NOW);
    expect(result.score).toBeCloseTo(0.5, 5);
    expect(result.verdict).toBe('flaky');
    expect(result.divergenceEvidence).toBe(2);
  });

  it('decays: one divergence exactly one half-life old → evidence 0.5 → score 0.2, healthy', () => {
    const result = assessFlakiness(divergencePair('sha-a', 14), 'main', NOW);
    expect(result.score).toBeCloseTo(0.5 / 2.5, 5);
    expect(result.verdict).toBe('healthy');
  });

  it('fail→pass→fail→pass across 4 attempts of one run = 3 divergence events', () => {
    const runId = ++runCounter;
    const history = (['failed', 'passed', 'failed', 'passed'] as const).map((status, i) =>
      outcome({ status, headSha: 'sha-x', githubRunId: runId, runAttempt: i + 1 }),
    );
    const result = assessFlakiness(history, 'main', NOW);
    expect(result.divergenceEvidence).toBe(3);
    expect(result.verdict).toBe('flaky');
  });

  it('partial re-run: absence in attempt 2 is NOT a pass, no divergence', () => {
    const runId = ++runCounter;
    // Attempt 1 ran the test (failed); attempt 2 re-ran only other tests, so
    // this identity has no attempt-2 outcome at all.
    const history = [
      outcome({ status: 'failed', headSha: 'sha-p', githubRunId: runId, runAttempt: 1 }),
    ];
    const result = assessFlakiness(history, 'main', NOW);
    expect(result.divergenceEvidence).toBe(0);
    expect(result.score).toBe(0);
  });

  it('cross-commit flips on the default branch are weak evidence (0.25 each)', () => {
    // 5 flips today: pass,fail,pass,fail,pass,fail across distinct shas.
    const history = (['passed', 'failed', 'passed', 'failed', 'passed', 'failed'] as const).map(
      (status, i) =>
        outcome({
          status,
          headSha: `sha-t${i}`,
          runStartedAt: new Date(NOW.getTime() - (5 - i) * 60_000),
        }),
    );
    const result = assessFlakiness(history, 'main', NOW);
    expect(result.transitionEvidence).toBe(5);
    // Precision 3: events sit minutes apart for ordering, so a sliver of
    // real decay applies.
    expect(result.score).toBeCloseTo(1.25 / 3.25, 3);
    expect(result.verdict).toBe('suspected');
  });

  it('flips off the default branch contribute nothing', () => {
    const history = (['passed', 'failed', 'passed', 'failed'] as const).map((status, i) =>
      outcome({
        status,
        headSha: `sha-b${i}`,
        headBranch: 'feat/some-pr',
        runStartedAt: new Date(NOW.getTime() - (3 - i) * 60_000),
      }),
    );
    const result = assessFlakiness(history, 'main', NOW);
    expect(result.transitionEvidence).toBe(0);
    expect(result.score).toBe(0);
  });

  it('unknown default branch disables transition evidence entirely', () => {
    const history = (['passed', 'failed'] as const).map((status, i) =>
      outcome({
        status,
        headSha: `sha-u${i}`,
        runStartedAt: new Date(NOW.getTime() - (1 - i) * 60_000),
      }),
    );
    const result = assessFlakiness(history, null, NOW);
    expect(result.transitionEvidence).toBe(0);
  });

  it('same-sha flips on the default branch count as divergence, not transition', () => {
    const history = [
      outcome({
        status: 'failed',
        headSha: 'sha-s',
        runStartedAt: new Date(NOW.getTime() - 60_000),
      }),
      outcome({ status: 'passed', headSha: 'sha-s' }),
    ];
    const result = assessFlakiness(history, 'main', NOW);
    expect(result.divergenceEvidence).toBe(1);
    expect(result.transitionEvidence).toBe(0);
  });

  it('thresholds come from config', () => {
    const strict = { ...DETECTION_DEFAULTS, flakyThreshold: 0.3 };
    const result = assessFlakiness(divergencePair('sha-a', 0), 'main', NOW, strict);
    expect(result.verdict).toBe('flaky');
  });
});
