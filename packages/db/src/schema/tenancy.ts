import { bigint, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { users } from './auth.js';

/**
 * Workspace multi-tenancy (D8, ADR-0012). A workspace is the tenant: it owns
 * GitHub App installations, and everything downstream (repositories, runs,
 * results, scores) reaches its tenant via
 * repositories.installation_id → installations.github_installation_id →
 * installations.workspace_id. Ingestion tables stay untouched — tenancy is
 * resolved at read time, never written into the ingest path.
 */
export const workspaces = pgTable('workspaces', {
  id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'bigint' })
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    // owner | member. M4 ships single-member workspaces; the role column and
    // this table exist so teams are a feature, not schema surgery (ADR-0012).
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workspace_members_workspace_user_idx').on(table.workspaceId, table.userId),
    // Membership resolution shape: "which workspaces does this user belong to".
    index('workspace_members_user_idx').on(table.userId),
  ],
);

/**
 * One row per GitHub App installation. workspace_id NULL = unclaimed: the
 * installation exists (webhooks may already be flowing, and pre-M4 rows are
 * backfilled by migration 0003) but no workspace has connected it yet.
 * Claiming happens exclusively through the signed-state setup redirect
 * (ADR-0012); account fields are nullable because backfilled rows only carry
 * the numeric id until an `installation` event or claim fills them in.
 */
export const installations = pgTable(
  'installations',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    githubInstallationId: bigint('github_installation_id', { mode: 'bigint' }).notNull().unique(),
    workspaceId: bigint('workspace_id', { mode: 'bigint' }).references(() => workspaces.id),
    accountLogin: text('account_login'),
    // User | Organization — GitHub's casing, straight from the payload.
    accountType: text('account_type'),
    // Set on `installation.deleted`; the row (and its ingested data) survives
    // uninstall so history is not silently orphaned.
    uninstalledAt: timestamp('uninstalled_at', { withTimezone: true, mode: 'date' }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // Tenancy resolution shape: "which installations belong to this workspace".
    index('installations_workspace_idx').on(table.workspaceId),
  ],
);
