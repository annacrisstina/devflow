import { createDbClient } from '@devflow/db/client';
import { createRedisConnection } from '@devflow/queue/connection';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createHealthServer, type HealthServer } from '../src/health-server.js';
import { jobsProcessed } from '../src/metrics.js';
import { createTestDb, REDIS_URL } from './helpers.js';

const log = pino({ level: 'silent' });

let client: Awaited<ReturnType<typeof createTestDb>>;
let redis: ReturnType<typeof createRedisConnection>;
let server: HealthServer;
const PORT = 3902;

beforeAll(async () => {
  client = await createTestDb('devflow_worker_health_test');
  redis = createRedisConnection(REDIS_URL);
  server = createHealthServer({
    db: client.db,
    redis,
    host: '127.0.0.1',
    port: PORT,
    log,
  });
  await server.listen();
});

afterAll(async () => {
  await server.close();
  await redis.quit();
  await client.close();
});

describe('worker health server (ADR-0021)', () => {
  it('reports ok when database and redis answer', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('serves Prometheus metrics including the worker job counter', async () => {
    jobsProcessed.inc({ result: 'completed' });
    const response = await fetch(`http://127.0.0.1:${PORT}/metrics`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    const body = await response.text();
    expect(body).toContain('devflow_worker_jobs_total{result="completed"}');
    expect(body).toContain('devflow_queue_jobs');
    expect(body).toContain('process_cpu_user_seconds_total');
  });

  it('reports 503 when the database is unreachable', async () => {
    const brokenDb = createDbClient('postgresql://devflow:devflow_local@127.0.0.1:59998/devflow');
    const broken = createHealthServer({
      db: brokenDb.db,
      redis,
      host: '127.0.0.1',
      port: PORT + 1,
      log,
    });
    await broken.listen();
    const response = await fetch(`http://127.0.0.1:${PORT + 1}/healthz`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
    await broken.close();
    await brokenDb.close();
  });

  it('404s unknown paths', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/nope`);
    expect(response.status).toBe(404);
  });
});
