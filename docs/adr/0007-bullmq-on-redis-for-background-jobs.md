# ADR-0007: BullMQ on Redis for background jobs

- **Status:** Accepted
- **Date:** 2026-07-18
- **Deciders:** founder + lead engineer

## Context

Milestone 2 moves everything expensive out of the webhook request path: artifact download, unzip, JUnit parsing and result persistence run in background workers (ADR-0005 reserved exactly one new call in the API — "enqueue after persist"). We need a job queue with retries, backoff, bounded concurrency and a dead-letter story, operable by a solo maintainer inside the `docker compose up` self-hosting constraint. Redis is already in the stack (future pub/sub fan-out, D4).

## Decision

We will use **BullMQ** with the existing Redis as broker.

- One queue (`ingest`), one job type (`process-workflow-run`) until a real second workload exists.
- **Job payloads reference the raw event (`webhookEventId`), never embed it.** The queue is a dispatch mechanism, not a store: Postgres holds the data, Redis holds only scheduling state. Total Redis loss is recoverable by re-enqueuing from `webhook_events`.
- `jobId = evt-<webhookEventId>` gives best-effort dedup (duplicate deliveries collapse while a job is queued) and turns GitHub redelivery into a repair mechanism for lost jobs. It is explicitly **not** the idempotency guarantee — that lives at the database layer (unique GitHub-id keys, replace-per-run).
- Retry policy: 5 attempts, exponential backoff — configured once, at the enqueue helper in `@devflow/queue`. BullMQ's failed set after exhausted attempts _is_ the dead-letter queue; no bespoke DLQ machinery.
- The shared contract (queue names, payload types, connection factory) lives in `@devflow/queue`, imported by both producer (api) and consumer (worker).

## Alternatives considered

- **Kafka / Redpanda** — the "impressive" choice and the wrong one: partitions, consumer groups and cluster operations are heavy machinery for hundreds of jobs per minute, and every self-hoster would pay that operational cost. A documented rejection is better portfolio material than an unjustified deployment.
- **Postgres-based queue (pg-boss / `SELECT … FOR UPDATE SKIP LOCKED`)** — genuinely respectable here: one fewer moving part, transactional enqueue with the raw insert. Rejected narrowly: Redis is already required (pub/sub in M4), BullMQ's retry/backoff/concurrency semantics come finished rather than hand-rolled, and queue state separated from the source-of-truth store keeps the "Redis is expendable" recovery story clean.
- **RabbitMQ** — another stateful service to operate, with no decisive advantage over BullMQ at this scale.
- **In-process `setImmediate` / no queue** — disqualified: loses work on process restart and couples ingestion latency to processing time, exactly what ADR-0005 forbids.

## Consequences

- Retries, backoff, bounded concurrency and failure inspection come from a battle-tested library; the worker stays thin.
- Redis becomes load-bearing for _liveness_ (jobs flow) but not for _safety_ (data survives it) — an explicit, testable boundary.
- BullMQ's Redis data structures are opaque; debugging queue state means BullMQ APIs, not `redis-cli` intuition. Accepted; the failed-set inspection commands are documented in the worker README.
- Job-id dedup semantics (best-effort, mortal) must never be presented as exactly-once — the ADR-0005 honesty rule extended to the queue layer.
