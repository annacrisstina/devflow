import type { LiveEvent, LiveEventType } from '@devflow/contract/events';
import type { Db } from '@devflow/db/client';
import { installations } from '@devflow/db/schema/tenancy';
import type { RedisConnection } from '@devflow/queue/connection';
import { LIVE_EVENTS_CHANNEL } from '@devflow/queue/live';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';

import { liveEventsPublished } from '../metrics.js';
import type { NormalizedRun } from '../pipeline/normalize-run.js';

export type LivePublisher = {
  runIngested: (run: NormalizedRun, log: Logger) => Promise<void>;
  runProcessed: (run: NormalizedRun, processingStatus: string, log: Logger) => Promise<void>;
  scoresUpdated: (run: NormalizedRun, log: Logger) => Promise<void>;
};

/**
 * Publishes live-feed events (ADR-0015). The publisher resolves the
 * workspace at publish time — one indexed lookup — so the API's fan-out
 * stays a dumb room broadcast. Unclaimed installations publish nothing
 * (there is no room to deliver to).
 *
 * Fire-and-forget by contract: any failure here is logged and swallowed —
 * a live-feed hiccup must never fail ingestion or trigger a retry.
 */
export function createLivePublisher(db: Db, redis: RedisConnection): LivePublisher {
  async function publish(
    type: LiveEventType,
    run: NormalizedRun,
    log: Logger,
    extra: Partial<LiveEvent> = {},
  ): Promise<void> {
    try {
      const rows = await db
        .select({ workspaceId: installations.workspaceId })
        .from(installations)
        .where(eq(installations.githubInstallationId, run.installationId))
        .limit(1);
      const workspaceId = rows[0]?.workspaceId;
      if (workspaceId == null) return;

      const event: LiveEvent = {
        type,
        workspaceId: workspaceId.toString(),
        repository: `${run.owner}/${run.repo}`,
        githubRunId: run.githubRunId.toString(),
        runAttempt: run.runAttempt,
        at: new Date().toISOString(),
        ...extra,
      };
      await redis.publish(LIVE_EVENTS_CHANNEL, JSON.stringify(event));
      liveEventsPublished.inc({ type });
    } catch (error) {
      log.warn({ err: error, type }, 'live event publish failed (ignored)');
    }
  }

  return {
    runIngested: (run, log) => publish('run.ingested', run, log),
    runProcessed: (run, processingStatus, log) =>
      publish('run.processed', run, log, { processingStatus }),
    scoresUpdated: (run, log) => publish('scores.updated', run, log),
  };
}
