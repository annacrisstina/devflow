import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createDbClient } from '@devflow/db/client';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
// Own throwaway database: @devflow/db's tests recreate devflow_test and turbo
// runs package test suites in parallel — sharing it would be a race.
const TEST_DB = 'devflow_api_test';
const SECRET = 'test-webhook-secret';

// Recorded-shape fixture: field structure follows GitHub's documented
// workflow_run.completed payload. Read as bytes — signatures cover the file
// exactly as stored, unaffected by any JSON re-serialization.
const fixtureBody = readFileSync(
  fileURLToPath(new URL('./fixtures/workflow-run-completed.json', import.meta.url)),
);

function sign(body: Buffer): string {
  return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

function deliveryHeaders(deliveryId: string, body: Buffer) {
  return {
    'content-type': 'application/json',
    'x-github-delivery': deliveryId,
    'x-github-event': 'workflow_run',
    'x-hub-signature-256': sign(body),
  };
}

function withDatabase(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  const admin = createDbClient(BASE_URL);
  await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`));
  await admin.db.execute(sql.raw(`CREATE DATABASE ${TEST_DB}`));
  await admin.close();

  const testDbUrl = withDatabase(BASE_URL, TEST_DB);
  const migrationClient = createDbClient(testDbUrl);
  await migrate(migrationClient.db, {
    // Monorepo-relative: the migrations folder is dev-time data of @devflow/db,
    // not part of its runtime exports.
    migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)),
  });
  await migrationClient.close();

  app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    databaseUrl: testDbUrl,
    webhookSecret: SECRET,
  });
});

afterAll(async () => {
  await app.close();
});

async function countRows(deliveryId: string): Promise<number> {
  const result = await app.db.execute(
    sql`SELECT count(*)::int AS n FROM webhook_events WHERE delivery_id = ${deliveryId}`,
  );
  return result.rows[0]?.n as number;
}

describe('POST /webhooks/github', () => {
  it('accepts a correctly signed delivery and persists it raw', async () => {
    const deliveryId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: deliveryHeaders(deliveryId, fixtureBody),
      body: fixtureBody,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: 'accepted' });

    const rows = await app.db
      .select()
      .from(webhookEvents)
      .where(sql`${webhookEvents.deliveryId} = ${deliveryId}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventType).toBe('workflow_run');
    expect(rows[0]?.action).toBe('completed');
    expect(rows[0]?.installationId).toBe(55443322n);
    expect(rows[0]?.payload).toEqual(JSON.parse(fixtureBody.toString('utf8')));
  });

  it('absorbs a redelivered GUID with 200 and keeps a single row', async () => {
    const deliveryId = randomUUID();
    const headers = deliveryHeaders(deliveryId, fixtureBody);

    const first = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers,
      body: fixtureBody,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers,
      body: fixtureBody,
    });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: 'duplicate' });
    expect(await countRows(deliveryId)).toBe(1);
  });

  it('rejects a tampered body with 401 and persists nothing', async () => {
    const deliveryId = randomUUID();
    const headers = deliveryHeaders(deliveryId, fixtureBody);
    const tampered = Buffer.from(
      fixtureBody.toString('utf8').replace('"conclusion": "failure"', '"conclusion": "success"'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers, // signature computed over the original bytes
      body: tampered,
    });

    expect(response.statusCode).toBe(401);
    expect(await countRows(deliveryId)).toBe(0);
  });

  it('rejects a missing signature header with 401', async () => {
    const deliveryId = randomUUID();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-github-delivery': deliveryId,
      'x-github-event': 'workflow_run',
    };
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers,
      body: fixtureBody,
    });

    expect(response.statusCode).toBe(401);
    expect(await countRows(deliveryId)).toBe(0);
  });

  it('rejects missing GitHub headers with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(fixtureBody) },
      body: fixtureBody,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a correctly signed non-JSON body with 400', async () => {
    const body = Buffer.from('not json at all');
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: deliveryHeaders(randomUUID(), body),
      body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid JSON payload' });
  });

  it('persists events without action or installation (ping)', async () => {
    const deliveryId = randomUUID();
    const body = Buffer.from(JSON.stringify({ zen: 'Keep it logically awesome.', hook_id: 1 }));
    const headers = { ...deliveryHeaders(deliveryId, body), 'x-github-event': 'ping' };

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers,
      body,
    });

    expect(response.statusCode).toBe(202);
    const rows = await app.db
      .select()
      .from(webhookEvents)
      .where(sql`${webhookEvents.deliveryId} = ${deliveryId}`);
    expect(rows[0]?.eventType).toBe('ping');
    expect(rows[0]?.action).toBeNull();
    expect(rows[0]?.installationId).toBeNull();
  });
});
