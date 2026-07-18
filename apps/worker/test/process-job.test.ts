import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { DbClient } from '@devflow/db/client';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { sql } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PermanentJobError } from '../src/errors.js';
import { processJob, type ProcessJobDeps } from '../src/process-job.js';
import { createTestDb } from './helpers.js';

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/workflow-run-completed.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, unknown>;

let client: DbClient;
const log = pino({ level: 'silent' });

function deps(
  artifactStage: ProcessJobDeps['artifactStage'] = async () => 'succeeded',
  detectionStage: ProcessJobDeps['detectionStage'] = async () => {},
  annotationStage: ProcessJobDeps['annotationStage'] = async () => {},
): ProcessJobDeps {
  return { db: client.db, log, artifactStage, detectionStage, annotationStage };
}

async function insertEvent(payload: unknown, deliveryId: string): Promise<string> {
  const rows = await client.db
    .insert(webhookEvents)
    .values({ deliveryId, eventType: 'workflow_run', action: 'completed', payload })
    .returning();
  return rows[0]!.id.toString();
}

beforeAll(async () => {
  client = await createTestDb('devflow_test_worker');
});

afterAll(async () => {
  await client.close();
});

describe('processJob', () => {
  it('normalizes repository and run from the raw event', async () => {
    const eventId = await insertEvent(fixture, 'w-guid-1');
    await processJob(deps(), { webhookEventId: eventId, deliveryId: 'w-guid-1' });

    const repos = await client.db.execute(
      sql`SELECT owner, name, installation_id FROM repositories WHERE github_repo_id = 823041188`,
    );
    expect(repos.rows).toHaveLength(1);
    expect(repos.rows[0]?.owner).toBe('annacrisstina');

    const runs = await client.db.execute(
      sql`SELECT run_attempt, head_sha, conclusion, processing_status
          FROM workflow_runs WHERE github_run_id = 10893745821`,
    );
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0]?.run_attempt).toBe(2);
    expect(runs.rows[0]?.conclusion).toBe('failure');
  });

  it('captures default_branch and keeps it when a later payload omits the field', async () => {
    const eventId = await insertEvent(fixture, 'w-guid-db-1');
    await processJob(deps(), { webhookEventId: eventId, deliveryId: 'w-guid-db-1' });

    const before = await client.db.execute(
      sql`SELECT default_branch FROM repositories WHERE github_repo_id = 823041188`,
    );
    expect(before.rows[0]?.default_branch).toBe('main');

    const stripped = structuredClone(fixture);
    delete (stripped.repository as Record<string, unknown>).default_branch;
    const strippedId = await insertEvent(stripped, 'w-guid-db-2');
    await processJob(deps(), { webhookEventId: strippedId, deliveryId: 'w-guid-db-2' });

    const after = await client.db.execute(
      sql`SELECT default_branch FROM repositories WHERE github_repo_id = 823041188`,
    );
    expect(after.rows[0]?.default_branch).toBe('main');
  });

  it('reprocessing converges instead of duplicating (semantic idempotency)', async () => {
    const eventId = await insertEvent(fixture, 'w-guid-2');
    await processJob(deps(), { webhookEventId: eventId, deliveryId: 'w-guid-2' });
    await processJob(deps(), { webhookEventId: eventId, deliveryId: 'w-guid-2' });

    const runs = await client.db.execute(
      sql`SELECT count(*)::int AS n FROM workflow_runs WHERE github_run_id = 10893745821`,
    );
    expect(runs.rows[0]?.n).toBe(1);
  });

  it('completes without retry on unusable payloads (permanent failure)', async () => {
    const eventId = await insertEvent({ not: 'a workflow run' }, 'w-guid-3');
    // Must NOT throw — a permanent failure is absorbed, not retried.
    await expect(
      processJob(deps(), { webhookEventId: eventId, deliveryId: 'w-guid-3' }),
    ).resolves.toBeUndefined();
  });

  it('marks the run failed when the artifact stage fails permanently', async () => {
    const payload = structuredClone(fixture);
    (payload.workflow_run as Record<string, unknown>).id = 777001;
    const eventId = await insertEvent(payload, 'w-guid-4');

    await processJob(
      deps(async () => {
        throw new PermanentJobError('artifact expired');
      }),
      { webhookEventId: eventId, deliveryId: 'w-guid-4' },
    );

    const runs = await client.db.execute(
      sql`SELECT processing_status FROM workflow_runs WHERE github_run_id = 777001`,
    );
    expect(runs.rows[0]?.processing_status).toBe('failed');
  });

  it('runs detection only when results were persisted', async () => {
    let detectionCalls = 0;
    const countingDetection = async () => {
      detectionCalls += 1;
    };

    const succeeded = structuredClone(fixture);
    (succeeded.workflow_run as Record<string, unknown>).id = 777010;
    const succeededId = await insertEvent(succeeded, 'w-guid-det-1');
    await processJob(
      deps(async () => 'succeeded', countingDetection),
      {
        webhookEventId: succeededId,
        deliveryId: 'w-guid-det-1',
      },
    );
    expect(detectionCalls).toBe(1);

    const empty = structuredClone(fixture);
    (empty.workflow_run as Record<string, unknown>).id = 777011;
    const emptyId = await insertEvent(empty, 'w-guid-det-2');
    await processJob(
      deps(async () => 'no_artifacts', countingDetection),
      {
        webhookEventId: emptyId,
        deliveryId: 'w-guid-det-2',
      },
    );
    expect(detectionCalls).toBe(1);
  });

  it('rethrows transient artifact errors so BullMQ retries', async () => {
    const payload = structuredClone(fixture);
    (payload.workflow_run as Record<string, unknown>).id = 777002;
    const eventId = await insertEvent(payload, 'w-guid-5');

    await expect(
      processJob(
        deps(async () => {
          throw new Error('ECONNRESET');
        }),
        { webhookEventId: eventId, deliveryId: 'w-guid-5' },
      ),
    ).rejects.toThrow('ECONNRESET');
  });
});
