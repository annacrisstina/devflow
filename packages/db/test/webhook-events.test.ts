import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDbClient, type DbClient } from '../src/client.js';
import { webhookEvents } from '../src/schema/webhook-events.js';

// Integration tests run against a real Postgres (compose locally, service
// container in CI) — the fixtures-over-mocks rule: what we are testing IS the
// generated SQL, so mocking the database would test nothing.
const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const TEST_DB = 'devflow_test';

function withDatabase(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

let client: DbClient;

beforeAll(async () => {
  // Recreate the throwaway database so every run starts from a clean slate
  // and the committed migrations are what builds the schema under test.
  const admin = createDbClient(BASE_URL);
  await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`));
  await admin.db.execute(sql.raw(`CREATE DATABASE ${TEST_DB}`));
  await admin.close();

  client = createDbClient(withDatabase(BASE_URL, TEST_DB));
  // fileURLToPath, not URL.pathname: the latter keeps percent-encoding and
  // breaks on paths with spaces (this repo has them).
  await migrate(client.db, {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
});

afterAll(async () => {
  await client.close();
});

const basePayload = { action: 'completed', workflow_run: { id: 42 } };

describe('webhook_events', () => {
  it('persists a delivery and fills defaults', async () => {
    const inserted = await client.db
      .insert(webhookEvents)
      .values({
        deliveryId: '72d3162e-cc78-11e3-81ab-4c9367dc0958',
        eventType: 'workflow_run',
        action: 'completed',
        installationId: 12345678n,
        payload: basePayload,
      })
      .returning();

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.id).toBeTypeOf('bigint');
    expect(inserted[0]?.receivedAt).toBeInstanceOf(Date);
    expect(inserted[0]?.payload).toEqual(basePayload);
  });

  it('absorbs a duplicate delivery GUID without a second row', async () => {
    const duplicate = {
      deliveryId: 'dup-delivery-guid',
      eventType: 'workflow_run',
      action: 'completed',
      payload: basePayload,
    };

    const first = await client.db
      .insert(webhookEvents)
      .values(duplicate)
      .onConflictDoNothing({ target: webhookEvents.deliveryId })
      .returning();
    const second = await client.db
      .insert(webhookEvents)
      .values(duplicate)
      .onConflictDoNothing({ target: webhookEvents.deliveryId })
      .returning();

    expect(first).toHaveLength(1);
    // Empty returning() on conflict is how the API layer will distinguish
    // "new delivery" (202) from "duplicate" (200).
    expect(second).toHaveLength(0);

    const rows = await client.db.execute(
      sql`SELECT count(*)::int AS n FROM webhook_events WHERE delivery_id = 'dup-delivery-guid'`,
    );
    expect(rows.rows[0]?.n).toBe(1);
  });

  it('accepts events without action or installation (e.g. ping)', async () => {
    const inserted = await client.db
      .insert(webhookEvents)
      .values({
        deliveryId: 'ping-delivery-guid',
        eventType: 'ping',
        payload: { zen: 'Keep it logically awesome.' },
      })
      .returning();

    expect(inserted[0]?.action).toBeNull();
    expect(inserted[0]?.installationId).toBeNull();
  });
});
