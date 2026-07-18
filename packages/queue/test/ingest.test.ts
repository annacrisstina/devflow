import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createRedisConnection } from '../src/connection.js';
import { createIngestQueue, enqueueProcessWorkflowRun, type IngestQueue } from '../src/ingest.js';

// Real Redis (compose locally, service container in CI) — what we are testing
// is queue behavior, so mocking the broker would test nothing.
const REDIS_URL = process.env.DEVFLOW_REDIS_URL ?? 'redis://127.0.0.1:6379';

let connection: ReturnType<typeof createRedisConnection>;
let queue: IngestQueue;

beforeAll(() => {
  connection = createRedisConnection(REDIS_URL);
  queue = createIngestQueue(connection);
});

beforeEach(async () => {
  await queue.obliterate({ force: true });
});

afterAll(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  await connection.quit();
});

describe('enqueueProcessWorkflowRun', () => {
  it('enqueues a job carrying the event reference and correlation id', async () => {
    await enqueueProcessWorkflowRun(queue, { webhookEventId: '42', deliveryId: 'guid-1' });

    const jobs = await queue.getJobs(['waiting']);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.name).toBe('process-workflow-run');
    expect(jobs[0]?.data).toEqual({ webhookEventId: '42', deliveryId: 'guid-1' });
    expect(jobs[0]?.opts.attempts).toBe(5);
  });

  it('collapses duplicate enqueues for the same event onto one job', async () => {
    await enqueueProcessWorkflowRun(queue, { webhookEventId: '42', deliveryId: 'guid-1' });
    await enqueueProcessWorkflowRun(queue, { webhookEventId: '42', deliveryId: 'guid-1' });

    const jobs = await queue.getJobs(['waiting']);
    expect(jobs).toHaveLength(1);
  });

  it('keeps distinct events as distinct jobs', async () => {
    await enqueueProcessWorkflowRun(queue, { webhookEventId: '42', deliveryId: 'guid-1' });
    await enqueueProcessWorkflowRun(queue, { webhookEventId: '43', deliveryId: 'guid-2' });

    const jobs = await queue.getJobs(['waiting']);
    expect(jobs).toHaveLength(2);
  });
});
