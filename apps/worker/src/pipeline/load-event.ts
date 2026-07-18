import type { Db } from '@devflow/db/client';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { eq } from 'drizzle-orm';

import { PermanentJobError } from '../errors.js';

export type RawEvent = typeof webhookEvents.$inferSelect;

/** The job carries only a reference; the raw event is re-read from Postgres. */
export async function loadEvent(db: Db, webhookEventId: string): Promise<RawEvent> {
  const id = BigInt(webhookEventId);
  const rows = await db.select().from(webhookEvents).where(eq(webhookEvents.id, id));
  const event = rows[0];
  if (event === undefined) {
    // A job referencing a nonexistent event can never succeed.
    throw new PermanentJobError(`webhook event ${webhookEventId} not found`);
  }
  return event;
}
