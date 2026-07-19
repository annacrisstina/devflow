import type { Db } from '@devflow/db/client';
import { installations } from '@devflow/db/schema/tenancy';
import type { ProcessInstallationEventJob } from '@devflow/queue/ingest';
import type { Logger } from 'pino';

import { PermanentJobError } from '../errors.js';
import { loadEvent } from './load-event.js';

/**
 * Applies an `installation` lifecycle event to the installations table
 * (ADR-0012). Pure database work — no GitHub API. Convergent: replaying any
 * event sequence ends in the same row state.
 *
 * - created/unsuspend → row exists, uninstalled_at cleared, account filled.
 * - deleted → uninstalled_at set; the row (and ingested history) survives.
 * - everything else → account fields refreshed only.
 *
 * workspace_id is NEVER touched here: claiming is exclusively the signed
 * setup redirect (apps/api); an uninstall does not un-claim.
 */
export async function processInstallationEvent(
  db: Db,
  log: Logger,
  job: ProcessInstallationEventJob,
): Promise<void> {
  const event = await loadEvent(db, job.webhookEventId);
  const payload = event.payload as Record<string, unknown>;
  const action = typeof payload.action === 'string' ? payload.action : null;
  const installation =
    payload.installation !== null && typeof payload.installation === 'object'
      ? (payload.installation as Record<string, unknown>)
      : null;
  const rawId = installation?.id;
  if (action === null || typeof rawId !== 'number' || !Number.isSafeInteger(rawId)) {
    throw new PermanentJobError('installation event lacks action or installation.id');
  }
  const githubInstallationId = BigInt(rawId);

  const account =
    installation?.account !== null && typeof installation?.account === 'object'
      ? (installation.account as Record<string, unknown>)
      : null;
  const accountLogin = typeof account?.login === 'string' ? account.login : null;
  const accountType = typeof account?.type === 'string' ? account.type : null;

  const uninstalledAt =
    action === 'deleted'
      ? new Date()
      : action === 'created' || action === 'unsuspend'
        ? null
        : undefined;

  await db
    .insert(installations)
    .values({
      githubInstallationId,
      accountLogin,
      accountType,
      uninstalledAt: uninstalledAt ?? null,
    })
    .onConflictDoUpdate({
      target: installations.githubInstallationId,
      set: {
        // A payload without account data must not erase known values.
        ...(accountLogin !== null ? { accountLogin } : {}),
        ...(accountType !== null ? { accountType } : {}),
        ...(uninstalledAt !== undefined ? { uninstalledAt } : {}),
        updatedAt: new Date(),
      },
    });

  log.info(
    { githubInstallationId: githubInstallationId.toString(), action },
    'installation event applied',
  );
}
