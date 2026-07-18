# ADR-0005: Raw-first, idempotent webhook ingestion

- **Status:** Accepted
- **Date:** 2026-07-18
- **Deciders:** founder + lead engineer

## Context

GitHub webhooks are the product's only input. Their delivery contract is hostile to naive designs: payloads are unauthenticated until proven otherwise, delivery is at-least-once and out-of-order, slow consumers get timed out (~10s), failed deliveries are **not** retried automatically (recovery is manual/API redelivery), and a monorepo push can fan out bursts of events. Whatever the ingestion endpoint does wrong is unrecoverable — data GitHub never successfully delivered, or delivered and we dropped, is gone.

## Decision

`POST /webhooks/github` does exactly four things, in a fixed order:

1. **Authenticate the raw bytes** — HMAC-SHA256 (`X-Hub-Signature-256`) verified with a constant-time comparison over the body exactly as received. Nothing (not even `JSON.parse`) touches the payload before this. Failure → generic 401.
2. **Parse** — only after authentication. Failure → 400.
3. **Persist raw, append-only** — the full payload lands in `webhook_events` as jsonb, in a single atomic `INSERT … ON CONFLICT (delivery_id) DO NOTHING`. The delivery GUID is the idempotency key; `event_type`/`action`/`installation_id` are extracted filter columns, never a replacement for the payload.
4. **ACK fast** — 202 for a new row, 200 for a duplicate (success either way: the sender must not redeliver). Database unreachable → 500, deliberately: GitHub records the failed delivery and redelivery is the recovery path; a fake 2xx would silently lose data.

Nothing expensive happens in-request. In M1 the pipeline ends at the raw row; M2 inserts "enqueue job" between steps 3 and 4.

Derived tables in later milestones must be rebuildable from `webhook_events` (event-sourcing-lite: replayability without event-sourcing ceremony).

## Alternatives considered

- **Normalize on ingest** (parse into runs/repos tables directly) — rejected: couples ingestion uptime to interpretation correctness. A parser bug would _lose the original data_; with raw-first it merely delays interpretation, and a re-run rebuilds everything.
- **Enqueue-before-persist (queue as the primary store)** — rejected: makes Redis durability the ceiling on data safety; Postgres is the source of truth by architectural stance. The queue (M2) is a dispatch mechanism, not a store.
- **Check-then-insert idempotency** (SELECT before INSERT) — rejected: racy under concurrent redelivery; the unique constraint plus `ON CONFLICT DO NOTHING` is atomic and returns "was it new" for free via `RETURNING`.
- **Storing the payload as raw text/bytea for byte fidelity** — rejected: the signature is verified at ingress against the true bytes and never needs re-verification from storage; jsonb buys queryability (which M2's normalizer needs) at the cost of formatting normalization we don't need to keep.
- **Pretending exactly-once** — explicitly not attempted. Delivery-GUID dedup handles transport-level duplicates; a _manual_ redelivery may arrive under a fresh GUID and create a second raw row, which is harmless in an append-only store. Semantic dedup ("same workflow_run seen twice") is the M2 normalizer's job, keyed on payload identity — GUID dedup must never be mistaken for it.

## Consequences

- The ingestion path is trivially fast and burst-tolerant; its correctness reduces to two testable properties (signature math, insert atomicity), both covered by integration tests against real Postgres with recorded-shape fixtures.
- `webhook_events` grows unboundedly and stores payloads we may never interpret; accepted until the M2 data-model ADR (partitioning is the assumed strategy).
- Replaying history is a `SELECT` over raw events — backfill and reprocessing become boring, which is the point.
- A 500 on database outage means webhook deliveries fail visibly during downtime and must be redelivered; this is chosen over the silent-loss alternative and will be softened by ops docs (redelivery runbook) in M6.
