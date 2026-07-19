import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { webhookEvents } from './webhook-events.js';

/**
 * Normalized (derived) side of the pipeline. Everything here must be
 * rebuildable from webhook_events + GitHub artifacts (ADR-0005/0008); nothing
 * here is a source of truth.
 *
 * Tenancy: rows reach their tenant via repository → installation_id. The
 * workspace layer (D8) attaches to installations in M4; until then the
 * installation is the tenancy root (ADR-0008).
 */
export const repositories = pgTable('repositories', {
  id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
  // GitHub's immutable numeric id — renames and transfers survive.
  githubRepoId: bigint('github_repo_id', { mode: 'bigint' }).notNull().unique(),
  installationId: bigint('installation_id', { mode: 'bigint' }).notNull(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  private: boolean('private').notNull(),
  // Transition evidence (ADR-0010) only counts on this branch: a flip on a PR
  // branch is plausibly the PR's fault, a flip here is suspicious.
  defaultBranch: text('default_branch'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    repositoryId: bigint('repository_id', { mode: 'bigint' })
      .notNull()
      .references(() => repositories.id),
    githubRunId: bigint('github_run_id', { mode: 'bigint' }).notNull(),
    // Attempts are separate rows on purpose: same-commit pass/fail divergence
    // across attempts is M3's strongest flakiness signal.
    runAttempt: integer('run_attempt').notNull(),
    // Provenance: the raw delivery this row was derived from.
    rawEventId: bigint('raw_event_id', { mode: 'bigint' })
      .notNull()
      .references(() => webhookEvents.id),
    name: text('name'),
    headBranch: text('head_branch'),
    headSha: text('head_sha').notNull(),
    event: text('event'),
    status: text('status'),
    conclusion: text('conclusion'),
    runStartedAt: timestamp('run_started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    // queued | processing | succeeded | failed | no_artifacts
    processingStatus: text('processing_status').notNull().default('queued'),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    // Checks-API annotation idempotency: reprocessing PATCHes this check
    // instead of stacking a new one (NULL = never annotated).
    flakeCheckRunId: bigint('flake_check_run_id', { mode: 'bigint' }),
  },
  (table) => [
    uniqueIndex('workflow_runs_github_run_attempt_idx').on(table.githubRunId, table.runAttempt),
    index('workflow_runs_repository_idx').on(table.repositoryId),
  ],
);

/**
 * Diagnostic record of every artifact considered for a run: makes "why are
 * there no results?" answerable from a table instead of a debugger.
 */
export const runArtifacts = pgTable('run_artifacts', {
  id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
  workflowRunId: bigint('workflow_run_id', { mode: 'bigint' })
    .notNull()
    .references(() => workflowRuns.id),
  githubArtifactId: bigint('github_artifact_id', { mode: 'bigint' }).notNull().unique(),
  name: text('name').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
  xmlFilesFound: integer('xml_files_found').notNull().default(0),
  skippedReason: text('skipped_reason'),
  processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

/**
 * The high-volume table. Deliberately NO unique constraint on
 * (run, suite, class, name): parameterized tests legitimately repeat names.
 * Idempotency is replace-per-run — a transaction deletes a run-attempt's rows
 * and reinserts (ADR-0008).
 */
export const testResults = pgTable(
  'test_results',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    workflowRunId: bigint('workflow_run_id', { mode: 'bigint' })
      .notNull()
      .references(() => workflowRuns.id),
    suiteName: text('suite_name').notNull().default(''),
    className: text('class_name').notNull().default(''),
    testName: text('test_name').notNull(),
    // passed | failed | skipped | error
    status: text('status').notNull(),
    durationMs: integer('duration_ms'),
    failureMessage: text('failure_message'),
    failureDetails: text('failure_details'),
    // sha256 of the canonical failure text (ADR-0018) — set by the AI
    // layer's embedding stage for failed/error rows; NULL when the layer is
    // disabled or amputated (nothing else reads it then).
    failureHash: text('failure_hash'),
    file: text('file'),
  },
  (table) => [
    index('test_results_workflow_run_idx').on(table.workflowRunId),
    // M3's lookup shape: history of one test across runs.
    index('test_results_test_identity_idx').on(table.suiteName, table.className, table.testName),
    // "Which tests hit this failure" (ADR-0018); partial — most rows pass.
    index('test_results_failure_hash_idx')
      .on(table.failureHash)
      .where(sql`${table.failureHash} IS NOT NULL`),
  ],
);
