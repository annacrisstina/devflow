import type { Db } from '@devflow/db/client';
import { repositories, workflowRuns } from '@devflow/db/schema/runs';

import { PermanentJobError } from '../errors.js';
import type { RawEvent } from './load-event.js';

export type NormalizedRun = {
  repositoryId: bigint;
  workflowRunId: bigint;
  installationId: bigint;
  owner: string;
  repo: string;
  githubRunId: bigint;
  runAttempt: number;
  headSha: string;
  /** Effective stored value — the transition-evidence gate (ADR-0010). */
  defaultBranch: string | null;
};

/**
 * Upserts the repository and workflow-run rows a raw workflow_run event
 * describes. Convergent by construction: reprocessing the same event (or a
 * redelivery under a new GUID) updates the same rows (ADR-0008).
 *
 * Payload shapes are validated field-by-field: this is external data, and a
 * payload that doesn't carry what we need is a permanent failure, not a retry.
 */
export async function normalizeRun(db: Db, event: RawEvent): Promise<NormalizedRun> {
  const payload = asObject(event.payload, 'payload');
  const repository = asObject(payload.repository, 'repository');
  const owner = asObject(repository.owner, 'repository.owner');
  const workflowRun = asObject(payload.workflow_run, 'workflow_run');
  const installation = asObject(payload.installation, 'installation');

  const githubRepoId = asSafeInteger(repository.id, 'repository.id');
  const installationId = asSafeInteger(installation.id, 'installation.id');
  const ownerLogin = asString(owner.login, 'repository.owner.login');
  const repoName = asString(repository.name, 'repository.name');
  const githubRunId = asSafeInteger(workflowRun.id, 'workflow_run.id');
  const runAttempt = asSafeInteger(workflowRun.run_attempt, 'workflow_run.run_attempt');
  const headSha = asString(workflowRun.head_sha, 'workflow_run.head_sha');
  const defaultBranch = optionalString(repository.default_branch);

  const repoRows = await db
    .insert(repositories)
    .values({
      githubRepoId: BigInt(githubRepoId),
      installationId: BigInt(installationId),
      owner: ownerLogin,
      name: repoName,
      private: repository.private === true,
      defaultBranch,
    })
    .onConflictDoUpdate({
      target: repositories.githubRepoId,
      set: {
        installationId: BigInt(installationId),
        owner: ownerLogin,
        name: repoName,
        private: repository.private === true,
        // A payload without the field must not erase a known default branch.
        ...(defaultBranch !== null ? { defaultBranch } : {}),
        updatedAt: new Date(),
      },
    })
    .returning({ id: repositories.id, defaultBranch: repositories.defaultBranch });
  const repositoryId = repoRows[0]!.id;

  const runValues = {
    repositoryId,
    githubRunId: BigInt(githubRunId),
    runAttempt: Number(runAttempt),
    rawEventId: event.id,
    name: optionalString(workflowRun.name),
    headBranch: optionalString(workflowRun.head_branch),
    headSha,
    event: optionalString(workflowRun.event),
    status: optionalString(workflowRun.status),
    conclusion: optionalString(workflowRun.conclusion),
    runStartedAt: optionalDate(workflowRun.run_started_at),
    completedAt: optionalDate(workflowRun.updated_at),
    processingStatus: 'processing',
    processedAt: null,
  };
  const runRows = await db
    .insert(workflowRuns)
    .values(runValues)
    .onConflictDoUpdate({
      target: [workflowRuns.githubRunId, workflowRuns.runAttempt],
      set: runValues,
    })
    .returning({ id: workflowRuns.id });

  return {
    repositoryId,
    workflowRunId: runRows[0]!.id,
    installationId: BigInt(installationId),
    owner: ownerLogin,
    repo: repoName,
    githubRunId: BigInt(githubRunId),
    runAttempt: Number(runAttempt),
    headSha,
    defaultBranch: repoRows[0]!.defaultBranch,
  };
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    throw new PermanentJobError(`payload field ${field} is missing or not an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new PermanentJobError(`payload field ${field} is missing or not a string`);
  }
  return value;
}

function asSafeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new PermanentJobError(`payload field ${field} is missing or not an integer`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function optionalDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
