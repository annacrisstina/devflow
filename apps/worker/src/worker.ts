import type { RedisConnection } from '@devflow/queue/connection';
import { INGEST_QUEUE_NAME, type ProcessWorkflowRunJob } from '@devflow/queue/ingest';
import { Worker } from 'bullmq';
import type { Logger } from 'pino';

import { processJob, type ProcessJobDeps } from './process-job.js';

export type IngestWorker = Worker<ProcessWorkflowRunJob>;

export function createIngestWorker(
  deps: ProcessJobDeps,
  connection: RedisConnection,
  concurrency: number,
  log: Logger,
): IngestWorker {
  const worker = new Worker<ProcessWorkflowRunJob>(
    INGEST_QUEUE_NAME,
    async (job) => {
      await processJob(deps, job.data);
    },
    { connection, concurrency },
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job.id, deliveryId: job.data.deliveryId }, 'job completed');
  });
  worker.on('failed', (job, error) => {
    // Transient failures land here per attempt; after the last attempt the
    // job stays in the failed set (the DLQ, ADR-0007).
    log.error(
      {
        jobId: job?.id,
        deliveryId: job?.data.deliveryId,
        attemptsMade: job?.attemptsMade,
        err: error,
      },
      'job attempt failed',
    );
  });

  return worker;
}
