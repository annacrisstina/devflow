import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const INGEST_QUEUE_NAME = 'ingest';

export const PROCESS_WORKFLOW_RUN = 'process-workflow-run';

/**
 * Job payloads reference the raw event instead of embedding it: the queue is
 * a dispatch mechanism, not a store (ADR-0005/0007). Losing Redis loses
 * scheduling, never data — jobs are rebuildable from webhook_events.
 */
export type ProcessWorkflowRunJob = {
  /** webhook_events.id, serialized (bigint doesn't survive JSON). */
  webhookEventId: string;
  /** GitHub delivery GUID — the cross-system log correlation key. */
  deliveryId: string;
};

export type IngestQueue = Queue<ProcessWorkflowRunJob>;

export function createIngestQueue(connection: Redis): IngestQueue {
  return new Queue<ProcessWorkflowRunJob>(INGEST_QUEUE_NAME, { connection });
}

/**
 * Enqueues processing for a persisted webhook event.
 *
 * jobId = event id makes duplicate deliveries collapse onto one job while it
 * is still queued. This is best-effort only (completed jobs are eventually
 * removed and a later redelivery would re-enqueue); true idempotency lives at
 * the database layer (replace-per-run, unique GitHub-id keys).
 */
export async function enqueueProcessWorkflowRun(
  queue: IngestQueue,
  job: ProcessWorkflowRunJob,
): Promise<void> {
  await queue.add(PROCESS_WORKFLOW_RUN, job, {
    jobId: `evt-${job.webhookEventId}`,
    attempts: 5,
    backoff: { type: 'exponential', delay: 15_000 },
    removeOnComplete: { count: 1000 },
    // Failed jobs are kept: BullMQ's failed set is the dead-letter queue.
    removeOnFail: false,
  });
}
