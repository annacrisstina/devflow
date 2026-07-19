import type { Db } from '@devflow/db/client';
import { workflowRuns } from '@devflow/db/schema/runs';
import type { ProcessWorkflowRunJob } from '@devflow/queue/ingest';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';

import type { AnnotationStage } from './annotation/annotation-stage.js';
import type { DetectionStage } from './detection/detection-stage.js';
import type { EmbeddingStage } from './ai/embedding-stage.js';
import { PermanentJobError } from './errors.js';
import type { LivePublisher } from './live/publisher.js';
import type { ArtifactStageOutcome } from './pipeline/artifact-stage.js';
import { loadEvent } from './pipeline/load-event.js';
import { normalizeRun, type NormalizedRun } from './pipeline/normalize-run.js';

export type ArtifactStage = (run: NormalizedRun, log: Logger) => Promise<ArtifactStageOutcome>;

export type ProcessJobDeps = {
  db: Db;
  log: Logger;
  /**
   * Fetch-parse-persist for the run's artifacts. Injected so the queue/normalize
   * plumbing is testable without GitHub; the real stage is wired in main.ts.
   */
  artifactStage: ArtifactStage;
  /** Flake-score recompute (ADR-0010); runs only after results persisted. */
  detectionStage: DetectionStage;
  /** Advisory check-run write-back (ADR-0011); runs after detection. */
  annotationStage: AnnotationStage;
  /**
   * Live-feed publisher (ADR-0015); optional so queue/normalize plumbing
   * tests need no Redis. Fire-and-forget: never fails the job.
   */
  live?: LivePublisher;
  /**
   * AI-layer embedding stage (ADR-0017/0018); optional — absent when the
   * layer is disabled or amputated. Failure-isolated: never fails the job.
   */
  embeddingStage?: EmbeddingStage;
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
  await deps.live?.runIngested(run, log);

  let outcome: ArtifactStageOutcome;
  try {
    outcome = await deps.artifactStage(run, log);
  } catch (error) {
    if (error instanceof PermanentJobError) {
      await deps.db
        .update(workflowRuns)
        .set({ processingStatus: 'failed', processedAt: new Date() })
        .where(eq(workflowRuns.id, run.workflowRunId));
      log.warn({ reason: error.message }, 'artifact processing failed permanently');
      await deps.live?.runProcessed(run, 'failed', log);
      return;
    }
    throw error;
  }

  // A run without artifacts changed no test history: nothing to reassess.
  // Detection errors propagate as transient — the whole job is convergent
  // under retry (upserts, replace-per-run, recompute-from-history).
  if (outcome !== 'succeeded') {
    await deps.live?.runProcessed(run, outcome, log);
    return;
  }
  await deps.detectionStage(run, log);
  await deps.live?.scoresUpdated(run, log);
  // Before annotation on purpose: annotation may absorb a permanent error
  // and return early; embeddings are independent of it.
  await deps.embeddingStage?.(run, log);

  // Results and scores are durable by now: a permanently failed annotation is
  // absorbed (never marks ingestion failed), a transient one retries the
  // convergent job (ADR-0011).
  try {
    await deps.annotationStage(run, log);
  } catch (error) {
    if (error instanceof PermanentJobError) {
      log.warn({ reason: error.message }, 'flake annotation failed permanently');
      await deps.live?.runProcessed(run, 'succeeded', log);
      return;
    }
    throw error;
  }
  await deps.live?.runProcessed(run, 'succeeded', log);
}
