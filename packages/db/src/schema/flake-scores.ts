import {
  bigint,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { repositories } from './runs.js';

/**
 * Derived flakiness verdict per test identity (ADR-0010). Rebuildable from
 * test_results at any time — scores are a cache of a deterministic
 * computation, never a source of truth. Evidence counts are stored so every
 * verdict can be explained ("2 same-commit divergences, 1 transition")
 * without recomputing.
 */
export const testFlakeScores = pgTable(
  'test_flake_scores',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    repositoryId: bigint('repository_id', { mode: 'bigint' })
      .notNull()
      .references(() => repositories.id),
    suiteName: text('suite_name').notNull().default(''),
    className: text('class_name').notNull().default(''),
    testName: text('test_name').notNull(),
    score: real('score').notNull(),
    // healthy | suspected | flaky
    verdict: text('verdict').notNull(),
    divergenceEvidence: integer('divergence_evidence').notNull().default(0),
    transitionEvidence: integer('transition_evidence').notNull().default(0),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true, mode: 'date' }),
    computedAt: timestamp('computed_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    uniqueIndex('test_flake_scores_identity_idx').on(
      table.repositoryId,
      table.suiteName,
      table.className,
      table.testName,
    ),
    // The M4 dashboard shape: "flakiest tests of this repo".
    index('test_flake_scores_repo_verdict_idx').on(table.repositoryId, table.verdict),
  ],
);
