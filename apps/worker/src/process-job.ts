import type { Db } from '@devflow/db/client';
import { workflowRuns } from '@devflow/db/schema/runs';
import type { ProcessWorkflowRunJob } from '@devflow/queue/ingest';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';

import { PermanentJobError } from './errors.js';
import { loadEvent } from './pipeline/load-event.js';
import { normalizeRun, type NormalizedRun } from './pipeline/normalize-run.js';

export type ArtifactStage = (run: NormalizedRun, log: Logger) => Promise<void>;

export type ProcessJobDeps = {
  db: Db;
  log: Logger;
  /**
   * Fetch-parse-persist for the run's artifacts. Injected so the queue/normalize
   * plumbing is testable without GitHub; the real stage is wired in main.ts.
   */
  artifactStage: ArtifactStage;
};

/**
 * The whole job. Throws → BullMQ retries (transient). PermanentJobError →
 * recorded on the run, job completes (never retried).
 */
export async function processJob(deps: ProcessJobDeps, job: ProcessWorkflowRunJob): Promise<void> {
  const log = deps.log.child({ deliveryId: job.deliveryId, webhookEventId: job.webhookEventId });

  const event = await loadEvent(deps.db, job.webhookEventId);
  let run: NormalizedRun;
  try {
    run = await normalizeRun(deps.db, event);
  } catch (error) {
    if (error instanceof PermanentJobError) {
      // No run row exists to mark failed; the raw event + this log line are
      // the full record of the rejection.
      log.warn({ reason: error.message }, 'event cannot be normalized; giving up');
      return;
    }
    throw error;
  }
  log.info(
    { githubRunId: run.githubRunId.toString(), runAttempt: run.runAttempt },
    'run normalized',
  );

  try {
    await deps.artifactStage(run, log);
  } catch (error) {
    if (error instanceof PermanentJobError) {
      await deps.db
        .update(workflowRuns)
        .set({ processingStatus: 'failed', processedAt: new Date() })
        .where(eq(workflowRuns.id, run.workflowRunId));
      log.warn({ reason: error.message }, 'artifact processing failed permanently');
      return;
    }
    throw error;
  }
}
