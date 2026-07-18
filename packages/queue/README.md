# @devflow/queue

The api ↔ worker contract: queue names, job payload types, enqueue helpers and the Redis connection factory. If a producer and a consumer disagree about a job's shape, the bug lives here — nowhere else defines it.

## Responsibility

- `ingest` queue: `process-workflow-run` jobs (`{ webhookEventId, deliveryId }`).
- Retry policy (5 attempts, exponential backoff) is set at enqueue time, in one place.

## Boundaries

- **Payloads reference raw events, never embed them.** The queue is a dispatch mechanism, not a store (ADR-0007): losing Redis loses scheduling, never data — jobs can be rebuilt from `webhook_events`.
- Job-id dedup (`evt-<id>`) is best-effort; real idempotency is the database layer's job.
- No business logic; never imports from `apps/*`.

## Dead letters

BullMQ's failed set (after 5 attempts) is the DLQ. Inspect / requeue:

```ts
const failed = await queue.getJobs(['failed']);
await failed[0]?.retry();
```
