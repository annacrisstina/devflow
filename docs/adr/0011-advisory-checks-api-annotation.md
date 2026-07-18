# ADR-0011: Advisory-only PR annotation via the Checks API

- **Status:** Accepted
- **Date:** 2026-07-18
- **Deciders:** founder + lead engineer

## Context

ADR-0010 produces verdicts; this ADR decides how they reach the developer. The product promise is a sentence in the PR: _"this failure is a known flake, not you."_ Constraints: the false-positive asymmetry (ADR-0010) means the annotation must be **structurally unable to block a merge**; the trust budget means it must be **silent when it has nothing to say**; pipeline discipline (ADR-0008) means reprocessing a run must **converge** instead of stacking duplicate annotations. Delivering it grows the GitHub App's permissions from Checks:read to **Checks:write**, which forces existing installers to re-approve — a known, accepted cost (roadmap M3).

## Decision

**A GitHub Checks API check run on the workflow run's `head_sha`, named `DevFlow flake report`, always concluded `neutral`, created only when there is something to say.**

- **Advisory by construction:** the conclusion is hardcoded `neutral`, which GitHub treats as passing even where the check is marked required — DevFlow _cannot_ turn a PR red. Blocking power is not a configuration away; it does not exist in the code path. Humans decide (D14's spirit applied to detection).
- **Silence is a feature:** no failing tests, or no failing test with a non-healthy verdict → no check run is created. Cold start therefore produces zero annotations (ADR-0010 fail-safe). The one exception: if a check run already exists for this run (a reprocess whose replaced results no longer flag anything), it is **PATCHed to an all-clear** rather than left stale — a stale "flaky" verdict on a fixed run is exactly the false positive the product must not produce.
- **Idempotency:** the check run id persists on `workflow_runs.flake_check_run_id`; the first annotation POSTs, every reprocess PATCHes the same check. At-least-once job delivery therefore converges to one check per run attempt.
- **Content is the ADR-0010 explainability contract:** per flagged test — verdict, score, and the evidence decomposed in plain language ("2 same-commit pass/fail divergences; 1 default-branch transition"). Capped at 20 tests per check (API output limits); the overflow count is stated in the summary, never silently dropped.
- **Failure isolation:** annotation failure never marks ingestion failed — results and scores are already durable. Permanent API errors (404/410) are logged and absorbed; transient errors rethrow into the job's normal backoff retry, which is safe because the whole job is convergent. A 403 from a not-yet-approved Checks:write permission is classified transient (indistinguishable from rate limiting by status alone), so it retries and lands in the DLQ — accepted and documented rather than special-cased.

## Alternatives considered

- **PR comments** — rejected: noisy (a new comment per push or an edit-war on one), attached to the PR not the sha, and socially heavier — a bot comment reads as blame, a checks-tab entry reads as CI. The checks tab is where test verdicts already live.
- **Commit status API** — rejected: single line of text, no markdown, no structured output; cannot carry the evidence decomposition that makes verdicts trustworthy.
- **`failure` / `action_required` conclusions** (make flakes block until acknowledged) — rejected on the asymmetry: a wrong "flaky" verdict that blocks a merge converts a scoring error into a workflow outage. Quarantine-with-human-approval (M4) is the sanctioned escalation path.
- **File/line-level check annotations** — attractive, but JUnit `file`/`line` attributes are unreliably populated across frameworks; deferred post-MVP rather than shipping annotations that point nowhere.
- **Always posting a check, including all-healthy runs** — rejected: a report that says "nothing to see" on every green run trains developers to ignore the one that matters.

## Consequences

- Installers must approve the Checks:write permission bump before annotations appear ([github-app-setup.md](../github-app-setup.md)); until approved, annotation jobs retry into the DLQ while ingestion and scoring continue unaffected.
- Annotations surface only on runs with failures — consistent with ADR-0010's recompute set, which guarantees scores are freshly computed exactly when a failure is being annotated.
- One check run per run attempt keeps re-run history legible: attempt 1's report and attempt 2's report are separate checks on the same sha, mirroring GitHub's own attempt model.
- The check name (`DevFlow flake report`) is part of the product surface; renaming it later orphans old checks visually — chosen once, deliberately plain.
