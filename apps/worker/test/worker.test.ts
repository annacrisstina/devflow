import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { DbClient } from '@devflow/db/client';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { createRedisConnection } from '@devflow/queue/connection';
import { createIngestQueue, enqueueProcessWorkflowRun } from '@devflow/queue/ingest';
import { QueueEvents } from 'bullmq';
import { sql } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIngestWorker, type IngestWorker } from '../src/worker.js';
import { createTestDb, REDIS_URL } from './helpers.js';

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/workflow-run-completed.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, unknown>;

let client: DbClient;
let worker: IngestWorker;
let queueConnection: ReturnType<typeof createRedisConnection>;
let workerConnection: ReturnType<typeof createRedisConnection>;
let queue: ReturnType<typeof createIngestQueue>;
let queueEvents: QueueEvents;

beforeAll(async () => {
  client = await createTestDb('devflow_test_worker_queue');
  queueConnection = createRedisConnection(REDIS_URL);
  workerConnection = createRedisConnection(REDIS_URL);
  queue = createIngestQueue(queueConnection);
  await queue.obliterate({ force: true });
  queueEvents = new QueueEvents('ingest', { connection: createRedisConnection(REDIS_URL) });
  await queueEvents.waitUntilReady();

  worker = createIngestWorker(
    { db: client.db, log: pino({ level: 'silent' }), artifactStage: async () => {} },
    workerConnection,
    1,
    pino({ level: 'silent' }),
  );
});

afterAll(async () => {
  await worker.close();
  await queueEvents.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await queueConnection.quit();
  await client.close();
});

describe('ingest worker', () => {
  it('consumes an enqueued job through the real queue and normalizes the run', async () => {
    const payload = structuredClone(fixture);
    (payload.workflow_run as Record<string, unknown>).id = 888001;
    const rows = await client.db
      .insert(webhookEvents)
      .values({ deliveryId: 'rt-guid-1', eventType: 'workflow_run', payload })
      .returning();
    const eventId = rows[0]!.id.toString();

    await enqueueProcessWorkflowRun(queue, { webhookEventId: eventId, deliveryId: 'rt-guid-1' });
    const job = await queue.getJob(`evt-${eventId}`);
    await job!.waitUntilFinished(queueEvents, 20_000);

    const runs = await client.db.execute(
      sql`SELECT processing_status FROM workflow_runs WHERE github_run_id = 888001`,
    );
    expect(runs.rows).toHaveLength(1);
  });
});
