import { bigint, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Append-only store of every GitHub webhook delivery, exactly as received.
 *
 * Raw-before-derived: this table is the source of truth the rest of the
 * pipeline is rebuilt from. Rows are never updated or deleted by application
 * code. `event_type`, `action` and `installation_id` are filter columns
 * copied out of the payload for cheap querying — `payload` remains canonical.
 */
export const webhookEvents = pgTable('webhook_events', {
  id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
  // X-GitHub-Delivery GUID — the idempotency key. Stored as text, not uuid:
  // the GUID format is GitHub's contract to change, not ours to assume.
  deliveryId: text('delivery_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  action: text('action'),
  installationId: bigint('installation_id', { mode: 'bigint' }),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
