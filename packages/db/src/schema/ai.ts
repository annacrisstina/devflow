import { bigint, index, pgTable, text, timestamp, uniqueIndex, vector } from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { repositories } from './runs.js';

/**
 * The AI layer's two permitted output sinks (ADR-0017). Both are advisory:
 * deleting them (with the @devflow/ai package) leaves the product fully
 * functional.
 */

/**
 * Content-addressed failure-text embeddings (ADR-0018): one row per distinct
 * normalized failure text per repository — a flaky test repeating one
 * message ten thousand times embeds once. Rebuildable derived data; the
 * dimension is the embedding model's (MiniLM, 384).
 */
export const failureEmbeddings = pgTable(
  'failure_embeddings',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    repositoryId: bigint('repository_id', { mode: 'bigint' })
      .notNull()
      .references(() => repositories.id),
    // sha256 of the canonical failure text (@devflow/ai failure-text).
    contentHash: text('content_hash').notNull(),
    // The canonical text itself — what search results and clusters display.
    snippet: text('snippet').notNull(),
    embedding: vector('embedding', { dimensions: 384 }).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('failure_embeddings_repo_hash_idx').on(table.repositoryId, table.contentHash),
  ],
);

/**
 * Cached LLM root-cause hypotheses (ADR-0019): one per test identity,
 * regenerated (upserted) on changed evidence or explicit human request.
 * Identity is copied, not FK'd to the score cache — same reasoning as
 * quarantine_records (ADR-0016). Provenance columns make every hypothesis
 * attributable: which model, which prompt version, who asked, when.
 */
export const aiHypotheses = pgTable(
  'ai_hypotheses',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    repositoryId: bigint('repository_id', { mode: 'bigint' })
      .notNull()
      .references(() => repositories.id),
    suiteName: text('suite_name').notNull().default(''),
    className: text('class_name').notNull().default(''),
    testName: text('test_name').notNull(),
    content: text('content').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    /** Digest of the evidence fed to the model — the cache key's freshness half. */
    inputDigest: text('input_digest').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ai_hypotheses_identity_idx').on(
      table.repositoryId,
      table.suiteName,
      table.className,
      table.testName,
    ),
    index('ai_hypotheses_repo_idx').on(table.repositoryId),
  ],
);
