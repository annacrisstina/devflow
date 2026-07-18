# ADR-0008: Normalized test-results data model

- **Status:** Accepted
- **Date:** 2026-07-18
- **Deciders:** founder + lead engineer

## Context

M2 turns raw `workflow_run.completed` events into queryable facts. The schema decided here is what M3's detection engine reads, so its shape is effectively an API for the most important code in the product. Constraints: derived tables must stay rebuildable from raw events + artifacts (ADR-0005); test-result volume is the highest in the system (runs × tests); tenancy (D8, workspaces) has no implementable owner until users exist in M4.

## Decision

Four tables: `repositories`, `workflow_runs`, `run_artifacts`, `test_results`.

- **`workflow_runs` is keyed `(github_run_id, run_attempt)` — attempts are separate rows.** A retried run on the same commit is the strongest flakiness evidence there is; making attempts first-class turns M3's core signal into a join instead of forensics. Upserts on this key make reprocessing convergent.
- **Idempotency for results is replace-per-run:** one transaction deletes a run-attempt's rows and reinserts the freshly parsed set. Deliberately **no unique constraint** on (run, suite, class, name) — parameterized tests repeat identities legitimately, so a natural key would be a lie the data can't keep.
- **Tenancy root is the installation until M4.** Every tenant-owned row reaches its tenant via `repository_id → repositories.installation_id`. The workspace layer (D8) attaches to installations in M4 with an `installations`/`workspaces` migration + backfill; creating ownerless workspace rows now would be speculative scaffolding. The full multi-tenancy ADR ships with that implementation (deviation from the roadmap's "tenancy ADR in M2", founder-approved 2026-07-18).
- **No partitioning yet — documented trigger instead of deployed complexity.** Honest volume math (hundreds of repos at MVP scale ⇒ single-digit millions of `test_results` rows) sits comfortably under proper indexes. Declarative partitioning would also require hand-written DDL outside Drizzle's model _before_ any retention policy exists to shape it. Revisit when: `test_results` approaches ~50M rows, or M6 defines retention. Same reasoning class as rejecting Kafka (ADR-0007).
- **No `test_suites` dimension table** — `suite_name` is denormalized onto results. A suites table earns existence when M3's aggregates want it.
- `run_artifacts` records every artifact considered (size, xml files found, skip reason): "why are there no results?" must be answerable from a table, not a debugger.
- `workflow_runs.raw_event_id` + `processing_status` put provenance and pipeline state on the **derived** side, keeping `webhook_events` pure append-only (ADR-0005 invariant).

## Alternatives considered

- **Storing results keyed by GitHub check/test IDs** — GitHub has no test-level identity; the (suite, class, name) triple from JUnit is all there is, and it is not unique. Hence replace-per-run.
- **Upsert-per-test-row instead of replace-per-run** — requires the unique key that parameterized tests break; delete+insert in one transaction is simpler and convergent by construction.
- **Partitioning `test_results` now** — rejected as above; recorded so the "when" is explicit.
- **A single denormalized results table (repo/run columns inline)** — write-simple but bloats the hot table with repeated strings and makes run-level state (processing_status) homeless.

## Consequences

- M3 reads clean shapes: history of a test = one indexed lookup on (suite, class, name); same-commit divergence = self-join on head_sha across attempts.
- Replace-per-run means a reprocessed run briefly has zero rows inside the transaction — invisible to readers at read-committed, but bulk rewrites are the cost of constraint-free idempotency.
- Deferred partitioning is a known future migration on the busiest table; the trigger conditions above are the contract that it won't be forgotten.
- The M4 tenancy migration (installations/workspaces + backfill from `repositories.installation_id`) is pre-committed by this design.
