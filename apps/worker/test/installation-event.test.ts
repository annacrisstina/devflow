import { installations } from '@devflow/db/schema/tenancy';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { processInstallationEvent } from '../src/pipeline/installation-event.js';
import { createTestDb } from './helpers.js';

let client: Awaited<ReturnType<typeof createTestDb>>;
const log = pino({ level: 'silent' });

beforeAll(async () => {
  client = await createTestDb('devflow_worker_install_test');
});

afterAll(async () => {
  await client.close();
});

async function eventFor(payload: unknown): Promise<string> {
  const rows = await client.db
    .insert(webhookEvents)
    .values({
      deliveryId: `install-${Math.random().toString(36).slice(2)}`,
      eventType: 'installation',
      payload,
    })
    .returning();
  return rows[0]!.id.toString();
}

async function row(id: bigint) {
  const rows = await client.db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, id));
  return rows[0];
}

describe('processInstallationEvent', () => {
  it('created inserts the row with account data', async () => {
    const eventId = await eventFor({
      action: 'created',
      installation: { id: 6001, account: { login: 'annacrisstina', type: 'User' } },
    });
    await processInstallationEvent(client.db, log, { webhookEventId: eventId, deliveryId: 'd1' });

    const r = await row(6001n);
    expect(r).toMatchObject({ accountLogin: 'annacrisstina', accountType: 'User' });
    expect(r?.uninstalledAt).toBeNull();
    expect(r?.workspaceId).toBeNull();
  });

  it('created fills account fields on a backfilled bare row without touching tenancy', async () => {
    await client.db.insert(installations).values({ githubInstallationId: 6002n });
    const eventId = await eventFor({
      action: 'created',
      installation: { id: 6002, account: { login: 'some-org', type: 'Organization' } },
    });
    await processInstallationEvent(client.db, log, { webhookEventId: eventId, deliveryId: 'd2' });

    const r = await row(6002n);
    expect(r).toMatchObject({ accountLogin: 'some-org', accountType: 'Organization' });
    expect(r?.workspaceId).toBeNull();
  });

  it('deleted marks uninstalled but keeps the row', async () => {
    const eventId = await eventFor({
      action: 'deleted',
      installation: { id: 6001, account: { login: 'annacrisstina', type: 'User' } },
    });
    await processInstallationEvent(client.db, log, { webhookEventId: eventId, deliveryId: 'd3' });

    const r = await row(6001n);
    expect(r?.uninstalledAt).toBeInstanceOf(Date);
    expect(r?.accountLogin).toBe('annacrisstina');
  });

  it('replay converges (redelivery of created after deleted clears the marker)', async () => {
    const eventId = await eventFor({
      action: 'created',
      installation: { id: 6001, account: { login: 'annacrisstina', type: 'User' } },
    });
    await processInstallationEvent(client.db, log, { webhookEventId: eventId, deliveryId: 'd4' });
    expect((await row(6001n))?.uninstalledAt).toBeNull();
  });

  it('a payload without installation.id is a permanent error', async () => {
    const eventId = await eventFor({ action: 'created', installation: {} });
    await expect(
      processInstallationEvent(client.db, log, { webhookEventId: eventId, deliveryId: 'd5' }),
    ).rejects.toThrow(/lacks action or installation.id/);
  });
});
