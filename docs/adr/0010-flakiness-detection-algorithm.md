# ADR-0010: Flakiness detection algorithm

- **Status:** Accepted
- **Date:** 2026-07-18
- **Deciders:** founder + lead engineer

## Context

This is the decision the product exists for. DevFlow must decide, per test, "is this failure likely flakiness or a real defect?" — and its **worst possible failure is a false positive**: wrongly labeling a genuine regression "flaky" teaches a team to ignore a real bug, which is precisely the disease the product treats. The verdict must also be _explainable to the developer it affects_ ("why does DevFlow say this is flaky?") and defensible under founder interviews. Constraints from prior decisions: AI never decides (D14); detection consumes the M2 schema (`workflow_runs` keyed by `(github_run_id, run_attempt)`, `test_results` history).

## Decision

A **deterministic, two-signal evidence model with exponential time decay and a saturating score.** No ML, no black boxes.

**Test identity** = `(repository, suite_name, class_name, test_name)`; multiple results of one identity within a run (parameterized tests) aggregate to **worst-status-per-run** before detection; `skipped` outcomes are excluded entirely.

**Evidence events, deliberately unequal:**

1. **Same-commit divergence (weight 1.0)** — adjacent outcome flips of one identity within the same `head_sha` (across run attempts or distinct runs). The code did not change and the outcome did: near-definitional flakiness. Only outcomes that _exist_ are compared — a test absent from a partial re-run ("re-run failed jobs") contributes nothing, because **absence is not a pass**.
2. **Cross-commit transition (weight 0.25)** — adjacent pass↔fail flips across _different_ shas, counted **only on the repository's default branch**. A flip on a PR branch is plausibly the PR's fault; a flip on the mainline is suspicious. The roadmap's stronger form ("…without related file changes") is **deferred post-MVP**: file-relatedness needs commit-diff retrieval and path heuristics; until then the ¼ weight plus conservative thresholds _is_ the compensation. Recorded as a known simplification, not an oversight.

**Scoring:**

```
evidence = Σ  weight(event) · 2^(−age_days(event) / H)        H = half-life, 14 days
score    = evidence / (evidence + K)                           K = saturation, 2.0
verdict  = flaky (≥ 0.5) | suspected (≥ 0.25) | healthy
```

Reference points (unit-tested verbatim): one divergence today → 0.33 _suspected_; two → 0.50 _flaky_; one divergence a half-life ago → 0.20 _healthy_; five same-day mainline transitions → 0.38 _suspected_. **A test that always fails scores zero** — deterministic breakage is not flakiness, and the model encodes that structurally (evidence comes only from _flips_).

**Computation:** event-driven and incremental. After a run's results persist, recompute only _(identities that failed in this run)_ ∪ _(identities in this run currently holding a non-healthy score)_ — the first makes scores rise, the second lets recovered tests decay back. Each recompute reads that identity's bounded history (90 days; at H=14 anything older contributes <1%) and upserts `test_flake_scores` (score, verdict, evidence counts, timestamps — enough to explain any verdict without recomputation). Scores are derived data, rebuildable from `test_results` at will.

**Configurability:** half-life, K, and both thresholds are environment-level in M3 (`DEVFLOW_FLAKE_*`); per-repo configuration arrives with M4's UI. Defaults are chosen to **under-flag**.

## Alternatives considered

- **ML/statistical-model classifiers** (features → trained verdict) — rejected on the product invariant (D14): a verdict that can't be explained from first principles can't be trusted with quarantine proposals, and training data doesn't exist at MVP scale. Also: the deterministic model IS the interview material.
- **Simple failure-rate threshold** ("failed >X% of last N runs") — rejected: conflates _broken_ with _flaky_ (a 100%-failing test maxes the metric while being definitionally not flaky) and ignores the same-commit signal, which is the strongest information available.
- **Windowed counts without decay** ("≥2 divergences in 30 days") — rejected: cliff effects at the window edge produce verdict flapping; exponential decay is smooth, cheap, and explains "why did the score drop?" trivially.
- **Bayesian estimation of per-test flip probability** — attractive and honest, but its parameters are as arbitrary as the weights here while being _harder to narrate_; saturation-ratio scoring gives the same qualitative behavior with arithmetic a PR comment can show.
- **Counting a sha's divergence once (set-based) instead of per-flip** — rejected: fail→pass→fail→pass on one sha is materially stronger evidence than one flip and should score accordingly.

## Consequences

- Every verdict decomposes into a sentence: "failed→passed on the same commit twice this week" — trust and debuggability by construction; the false-positive asymmetry is addressed by weights, saturation, under-flagging defaults, advisory-only annotation (ADR-0011) and human-approved quarantine (M4).
- Cold start fails safe: no evidence → no verdicts → no annotations. Divergence evidence works from the first re-run ever observed.
- Weak-signal quality is knowingly limited until file-relatedness lands (post-MVP path recorded).
- Stale scores (a flaky test that stops appearing) persist until the identity next appears; harmless in M3 — verdicts only surface on new failures — and M4's dashboard applies decay-at-read for display.
- Threshold tuning is expected: evidence counts are stored precisely so tuning is observation ("what would 0.4 have flagged?") rather than guesswork; dogfooding data is the calibration set.
