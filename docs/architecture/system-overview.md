# System Overview (as of Milestone 3)

> Drawn from code that exists, not intentions. Update alongside the milestone that changes it. Decision history: [../adr/](../adr/).

## Context

DevFlow is a self-hostable CI reliability platform for GitHub Actions: it ingests workflow runs, parses JUnit artifacts, computes deterministic flakiness verdicts, and annotates PRs with advisory check runs.

```mermaid
flowchart LR
    GH[GitHub] -->|workflow_run webhooks| API[apps/api<br/>Fastify]
    API -->|jobs| Q[(Redis<br/>BullMQ)]
    Q --> W[apps/worker]
    W -->|artifact zips| GH
    W -->|check runs neutral| GH
    API --> PG[(Postgres)]
    W --> PG
```

- **`apps/api`** — receives webhooks: constant-time HMAC over raw bytes, verify-before-parse, delivery-GUID-idempotent append-only persist, then enqueue (ADR-0005).
- **`apps/worker`** — everything else: normalization, artifact fetch/parse, detection, annotation (ADR-0007/0009/0010/0011).
- **`packages/db`** — Drizzle schema + forward-only migrations; **`packages/queue`** — the api↔worker contract (dispatch, never storage).
- Dependency direction: apps → packages, never the reverse, never app → app.

## The processing pipeline (one job)

`process-workflow-run` jobs carry only `{webhookEventId, deliveryId}` — the raw event in Postgres is the source of truth; Redis loss loses scheduling, never data.

```mermaid
flowchart TD
    J[BullMQ job] --> LE[load-event<br/>read raw webhook_events row]
    LE --> NR[normalize-run<br/>convergent upserts:<br/>repositories + workflow_runs]
    NR --> AS[artifact-stage<br/>list -> download zip -> stream-parse JUnit<br/>replace-per-run persist into test_results]
    AS -->|no_artifacts| END1[mark run, stop]
    AS -->|succeeded| DS[detection-stage ADR-0010<br/>recompute failed-now and non-healthy-present<br/>90-day history -> score -> upsert test_flake_scores]
    DS --> AN[annotation-stage ADR-0011<br/>failing tests with non-healthy verdicts?<br/>POST or PATCH neutral check run]
    AN --> END2[job complete]
```

Failure taxonomy at every stage: `PermanentJobError` → absorbed (run marked `failed`, or annotation skipped with a warning — never retried); anything else → rethrown for BullMQ's exponential backoff (5 attempts, failed set = DLQ). The whole job is convergent under retry: upserts, replace-per-run, recompute-from-history, PATCH-by-stored-id.

## Data model (normalized side)

```mermaid
erDiagram
    webhook_events ||--o{ workflow_runs : "raw_event_id (provenance)"
    repositories ||--o{ workflow_runs : ""
    workflow_runs ||--o{ run_artifacts : "diagnostics"
    workflow_runs ||--o{ test_results : "replace-per-run"
    repositories ||--o{ test_flake_scores : "one per test identity"
```

- `workflow_runs` is keyed `(github_run_id, run_attempt)` — attempts are separate rows on purpose: same-commit divergence across attempts is the strongest flakiness signal (ADR-0008).
- `test_results` has deliberately **no** unique identity constraint (parameterized tests repeat names); idempotency is replace-per-run.
- `test_flake_scores` is **derived data** — rebuildable from `test_results` at any time; evidence counts are stored so any verdict can be explained without recomputation (ADR-0010).
- Tenancy root until M4: the GitHub App installation (`repositories.installation_id`).

## Detection in one paragraph (ADR-0010)

Per test identity `(repository, suite, class, name)`: collect adjacent outcome flips — same-commit flips weigh 1.0 (the code didn't change; near-definitional flakiness), cross-commit flips on the default branch weigh 0.25 (the code may be at fault). Each flip decays with a 14-day half-life; `score = evidence/(evidence+2)`; flaky ≥ 0.5, suspected ≥ 0.25. A test that always fails accumulates **zero** evidence (no flips) — broken is not flaky, structurally. Verdicts reach developers only through the advisory `neutral` check run (ADR-0011), which cannot block a merge.
