/**
 * The statistical heart of DevFlow (ADR-0010). Deterministic and explainable
 * by design: no model, no training — a verdict must survive "why?" asked by
 * a developer whose PR we just annotated.
 *
 * Pure functions only: history in, score out. All I/O lives in the pipeline
 * step that calls this.
 */

export type TestRunOutcome = {
  /** Chronology: when the run started (ties broken by runAttempt). */
  runStartedAt: Date;
  headSha: string;
  githubRunId: bigint;
  runAttempt: number;
  headBranch: string | null;
  /** Aggregated worst-status-per-identity-per-run; skipped never reaches here. */
  status: 'passed' | 'failed' | 'error';
};

export type DetectionConfig = {
  halfLifeDays: number;
  saturationK: number;
  flakyThreshold: number;
  suspectThreshold: number;
};

export const DETECTION_DEFAULTS: DetectionConfig = {
  halfLifeDays: 14,
  saturationK: 2.0,
  flakyThreshold: 0.5,
  suspectThreshold: 0.25,
};

export type FlakeAssessment = {
  score: number;
  verdict: 'healthy' | 'suspected' | 'flaky';
  divergenceEvidence: number;
  transitionEvidence: number;
  lastFailureAt: Date | null;
};

const DIVERGENCE_WEIGHT = 1.0;
// Cross-commit flips are weak evidence: the flip may be the code's fault.
// File-relatedness analysis is deferred post-MVP; this discount plus
// conservative thresholds is the compensation (ADR-0010).
const TRANSITION_WEIGHT = 0.25;

type EvidenceEvent = { weight: number; at: Date; kind: 'divergence' | 'transition' };

/**
 * Assesses one test identity from its chronological outcome history.
 *
 * - Divergence: adjacent outcome flips within the SAME head_sha (re-runs).
 *   Only outcomes that exist are compared — a test absent from a partial
 *   re-run contributes nothing (absence ≠ pass).
 * - Transition: adjacent outcome flips across DIFFERENT shas, counted only
 *   on the default branch.
 * - A test that always fails accumulates zero evidence: deterministic
 *   breakage is not flakiness.
 */
export function assessFlakiness(
  history: TestRunOutcome[],
  defaultBranch: string | null,
  now: Date,
  config: DetectionConfig = DETECTION_DEFAULTS,
): FlakeAssessment {
  const ordered = [...history].sort(
    (a, b) => a.runStartedAt.getTime() - b.runStartedAt.getTime() || a.runAttempt - b.runAttempt,
  );

  const events: EvidenceEvent[] = [];

  // Divergence: flips between chronologically adjacent outcomes of one sha.
  const bySha = new Map<string, TestRunOutcome[]>();
  for (const outcome of ordered) {
    const group = bySha.get(outcome.headSha);
    if (group === undefined) bySha.set(outcome.headSha, [outcome]);
    else group.push(outcome);
  }
  for (const group of bySha.values()) {
    for (let i = 1; i < group.length; i++) {
      if (isFail(group[i]!) !== isFail(group[i - 1]!)) {
        events.push({ weight: DIVERGENCE_WEIGHT, at: group[i]!.runStartedAt, kind: 'divergence' });
      }
    }
  }

  // Transitions: flips between adjacent default-branch outcomes on different shas.
  if (defaultBranch !== null) {
    const mainline = ordered.filter((o) => o.headBranch === defaultBranch);
    for (let i = 1; i < mainline.length; i++) {
      const previous = mainline[i - 1]!;
      const current = mainline[i]!;
      if (current.headSha !== previous.headSha && isFail(current) !== isFail(previous)) {
        events.push({ weight: TRANSITION_WEIGHT, at: current.runStartedAt, kind: 'transition' });
      }
    }
  }

  let evidence = 0;
  for (const event of events) {
    const ageDays = Math.max(0, (now.getTime() - event.at.getTime()) / 86_400_000);
    evidence += event.weight * 2 ** (-ageDays / config.halfLifeDays);
  }

  const score = evidence / (evidence + config.saturationK);
  const failures = ordered.filter(isFail);

  return {
    score,
    verdict:
      score >= config.flakyThreshold
        ? 'flaky'
        : score >= config.suspectThreshold
          ? 'suspected'
          : 'healthy',
    divergenceEvidence: events.filter((e) => e.kind === 'divergence').length,
    transitionEvidence: events.filter((e) => e.kind === 'transition').length,
    lastFailureAt: failures.length > 0 ? failures[failures.length - 1]!.runStartedAt : null,
  };
}

function isFail(outcome: TestRunOutcome): boolean {
  return outcome.status === 'failed' || outcome.status === 'error';
}
