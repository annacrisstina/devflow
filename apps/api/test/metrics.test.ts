import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createDbClient } from '@devflow/db/client';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { testConfig } from './test-config.js';

const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const TEST_DB = 'devflow_api_metrics_test';
const SECRET = 'test-webhook-secret';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  const admin = createDbClient(BASE_URL);
  await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`));
  await admin.db.execute(sql.raw(`CREATE DATABASE ${TEST_DB}`));
  await admin.close();

  const url = new URL(BASE_URL);
  url.pathname = `/${TEST_DB}`;
  const migrationClient = createDbClient(url.toString());
  await migrate(migrationClient.db, {
    migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)),
  });
  await migrationClient.close();

  app = await buildApp(testConfig({ databaseUrl: url.toString() }));
  await app.ingestQueue.obliterate({ force: true });
});

afterAll(async () => {
  await app.ingestQueue.obliterate({ force: true });
  await app.close();
});

describe('GET /metrics (ADR-0021)', () => {
  it('serves Prometheus text with default and HTTP metrics', async () => {
    await app.inject({ method: 'GET', url: '/healthz' });
    const response = await app.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('process_cpu_user_seconds_total');
    expect(response.body).toContain('devflow_http_request_duration_seconds_count{route="/healthz"');
  });

  it('counts webhook deliveries by outcome', async () => {
    const body = Buffer.from(JSON.stringify({ action: 'ping' }));
    await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-delivery': randomUUID(),
        'x-github-event': 'ping',
        'x-hub-signature-256': `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`,
      },
      payload: body,
    });
    await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-delivery': randomUUID(),
        'x-github-event': 'ping',
        'x-hub-signature-256': 'sha256=deadbeef',
      },
      payload: body,
    });

    const metrics = (await app.inject({ method: 'GET', url: '/metrics' })).body;
    expect(metrics).toMatch(/devflow_webhook_deliveries_total\{outcome="accepted"\} [1-9]/);
    expect(metrics).toMatch(
      /devflow_webhook_deliveries_total\{outcome="rejected_signature"\} [1-9]/,
    );
  });

  it('does not observe its own scrapes', async () => {
    await app.inject({ method: 'GET', url: '/metrics' });
    const metrics = (await app.inject({ method: 'GET', url: '/metrics' })).body;
    expect(metrics).not.toContain('route="/metrics"');
  });
});
