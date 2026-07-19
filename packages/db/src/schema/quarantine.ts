import { sql } from 'drizzle-orm';
import { bigint, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { repositories } from './runs.js';

/**
 * Durable record of human quarantine decisions (ADR-0016). Proposals are a
 * QUERY (effective verdict `flaky` with no record here), never rows — the
 * only writer of quarantine state is a human action, which is how the
 * "AI/automation assists, humans decide" invariant (D14) is kept structural.
 *
 * Test identity is COPIED (suite/class/test), not referenced into
 * test_flake_scores: scores are a rebuildable cache and a human decision must
 * not dangle when the cache is rebuilt.
 *
 * Each decision is a new row (history is append-only in spirit): approve →
 * `active`, dismiss a proposal → `dismissed`, lift updates the active row to
 * `lifted`. The partial unique index allows at most one ACTIVE record per
 * identity while keeping every past decision queryable.
 */
export const quarantineRecords = pgTable(
  'quarantine_records',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    repositoryId: bigint('repository_id', { mode: 'bigint' })
      .notNull()
      .references(() => repositories.id),
    suiteName: text('suite_name').notNull().default(''),
    className: text('class_name').notNull().default(''),
    testName: text('test_name').notNull(),
    // active | dismissed | lifted
    status: text('status').notNull(),
    reason: text('reason'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    liftedBy: text('lifted_by').references(() => users.id),
    liftedAt: timestamp('lifted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('quarantine_records_active_identity_idx')
      .on(table.repositoryId, table.suiteName, table.className, table.testName)
      .where(sql`${table.status} = 'active'`),
    // Dashboard list shape: records of one repo by status.
    index('quarantine_records_repo_status_idx').on(table.repositoryId, table.status),
  ],
);
