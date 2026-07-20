import type { RedisConnection } from '@devflow/queue/connection';
import {
  INGEST_QUEUE_NAME,
  PROCESS_INSTALLATION_EVENT,
  type ProcessWorkflowRunJob,
} from '@devflow/queue/ingest';
import { Worker } from 'bullmq';
import type { Logger } from 'pino';

import { PermanentJobError } from './errors.js';
import { jobDuration, jobsProcessed } from './metrics.js';
import { processInstallationEvent } from './pipeline/installation-event.js';
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
      // One queue, dispatch on job name (ADR-0007: the queue is a dispatch
      // mechanism; what a job MEANS is the worker's business).
      if (job.name === PROCESS_INSTALLATION_EVENT) {
        const jobLog = deps.log.child({ deliveryId: job.data.deliveryId });
        try {
          await processInstallationEvent(deps.db, jobLog, job.data);
        } catch (error) {
          if (error instanceof PermanentJobError) {
            jobLog.warn({ reason: error.message }, 'installation event dropped');
            return;
          }
          throw error;
        }
        return;
      }
      await processJob(deps, job.data);
    },
    { connection, concurrency },
  );

  worker.on('completed', (job) => {
    jobsProcessed.inc({ result: 'completed' });
    if (job.finishedOn !== undefined && job.processedOn !== undefined) {
      jobDuration.observe((job.finishedOn - job.processedOn) / 1000);
    }
    log.info({ jobId: job.id, deliveryId: job.data.deliveryId }, 'job completed');
  });
  worker.on('failed', (job, error) => {
    jobsProcessed.inc({ result: 'failed' });
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
