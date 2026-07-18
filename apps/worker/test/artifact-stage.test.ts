import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { DbClient } from '@devflow/db/client';
import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { sql } from 'drizzle-orm';
import { pino } from 'pino';
import { MockAgent, fetch as undiciFetch } from 'undici';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import yazl from 'yazl';

import { createGitHubClient, type GitHubClientOptions } from '../src/github/client.js';
import { createArtifactStage } from '../src/pipeline/artifact-stage.js';
import { normalizeRun } from '../src/pipeline/normalize-run.js';
import { loadEvent } from '../src/pipeline/load-event.js';
import { createTestDb } from './helpers.js';

const BASE = 'https://github.stub';
const log = pino({ level: 'silent' });

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/workflow-run-completed.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, unknown>;

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/junit/${name}`, import.meta.url));
}

/** Builds an artifact zip from the committed XML fixtures, in memory. */
function buildZip(entries: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const [nameInZip, sourcePath] of Object.entries(entries)) {
      zip.addFile(sourcePath, nameInZip);
    }
    zip.end();
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
}

let client: DbClient;

beforeAll(async () => {
  client = await createTestDb('devflow_test_artifacts');
});

afterAll(async () => {
  await client.close();
});

type StubArtifact = { id: number; name: string; zip?: Buffer; expired?: boolean; size?: number };

function stubGitHub(artifacts: StubArtifact[]): ReturnType<typeof createGitHubClient> {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const pool = agent.get(BASE);
  pool
    .intercept({ path: /\/app\/installations\/\d+\/access_tokens/, method: 'POST' })
    .reply(201, {
      token: 'ghs_stub',
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    })
    .persist();
  pool
    .intercept({ path: /\/repos\/.+\/actions\/runs\/\d+\/artifacts.*/, method: 'GET' })
    .reply(200, {
      total_count: artifacts.length,
      artifacts: artifacts.map((a) => ({
        id: a.id,
        name: a.name,
        size_in_bytes: a.size ?? a.zip?.length ?? 0,
        expired: a.expired ?? false,
      })),
    })
    .persist();
  for (const artifact of artifacts) {
    if (artifact.zip !== undefined) {
      pool
        .intercept({ path: `/repos/annacrisstina/devflow/actions/artifacts/${artifact.id}/zip` })
        .reply(200, artifact.zip)
        .persist();
    }
  }
  const fetchImpl = ((url: string, init?: object) =>
    undiciFetch(url, {
      ...init,
      dispatcher: agent,
    })) as unknown as NonNullable<GitHubClientOptions['fetchImpl']>;
  return createGitHubClient({ appId: '1', privateKeyPem: TEST_KEY, baseUrl: BASE, fetchImpl });
}

// Any RSA key works — the stub never validates the JWT.
import { generateKeyPairSync } from 'node:crypto';
const TEST_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs1', format: 'pem' })
  .toString();

async function makeRun(githubRunId: number, deliveryId: string) {
  const payload = structuredClone(fixture);
  (payload.workflow_run as Record<string, unknown>).id = githubRunId;
  const rows = await client.db
    .insert(webhookEvents)
    .values({ deliveryId, eventType: 'workflow_run', payload })
    .returning();
  const event = await loadEvent(client.db, rows[0]!.id.toString());
  return normalizeRun(client.db, event);
}

describe('artifactStage', () => {
  it('downloads, scans and persists results from a real zip (full pipeline)', async () => {
    const zip = await buildZip({
      'reports/jest-junit.xml': fixturePath('jest-junit.xml'),
      'reports/pytest.xml': fixturePath('pytest.xml'),
      'coverage/not-junit.xml': fixturePath('not-junit.xml'),
      'logs/readme.txt': fixturePath('not-junit.xml'),
    });
    const run = await makeRun(910001, 'as-guid-1');
    const stage = createArtifactStage({
      db: client.db,
      github: stubGitHub([{ id: 71, name: 'test-results', zip }]),
      maxArtifactBytes: 10_000_000,
      maxXmlEntryBytes: 1_000_000,
    });

    await stage(run, log);

    const results = await client.db.execute(
      sql`SELECT status, count(*)::int AS n FROM test_results
          WHERE workflow_run_id = ${run.workflowRunId} GROUP BY status ORDER BY status`,
    );
    // jest: 4 passed + 1 failed; pytest: 2 passed + 1 skipped
    expect(results.rows).toEqual([
      { status: 'failed', n: 1 },
      { status: 'passed', n: 6 },
      { status: 'skipped', n: 1 },
    ]);

    const runRow = await client.db.execute(
      sql`SELECT processing_status FROM workflow_runs WHERE id = ${run.workflowRunId}`,
    );
    expect(runRow.rows[0]?.processing_status).toBe('succeeded');

    const artifactRows = await client.db.execute(
      sql`SELECT xml_files_found, skipped_reason FROM run_artifacts WHERE github_artifact_id = 71`,
    );
    expect(artifactRows.rows[0]?.xml_files_found).toBe(2);
    expect(artifactRows.rows[0]?.skipped_reason).toBe('skipped_xml_files:1');
  });

  it('is idempotent under reprocessing (replace-per-run)', async () => {
    const zip = await buildZip({ 'pytest.xml': fixturePath('pytest.xml') });
    const run = await makeRun(910002, 'as-guid-2');
    const stage = createArtifactStage({
      db: client.db,
      github: stubGitHub([{ id: 72, name: 'test-results', zip }]),
      maxArtifactBytes: 10_000_000,
      maxXmlEntryBytes: 1_000_000,
    });

    await stage(run, log);
    await stage(run, log);

    const results = await client.db.execute(
      sql`SELECT count(*)::int AS n FROM test_results WHERE workflow_run_id = ${run.workflowRunId}`,
    );
    expect(results.rows[0]?.n).toBe(3);
  });

  it('marks runs without artifacts as no_artifacts', async () => {
    const run = await makeRun(910003, 'as-guid-3');
    const stage = createArtifactStage({
      db: client.db,
      github: stubGitHub([]),
      maxArtifactBytes: 10_000_000,
      maxXmlEntryBytes: 1_000_000,
    });

    await stage(run, log);

    const runRow = await client.db.execute(
      sql`SELECT processing_status FROM workflow_runs WHERE id = ${run.workflowRunId}`,
    );
    expect(runRow.rows[0]?.processing_status).toBe('no_artifacts');
  });

  it('records skip reasons for expired and oversized artifacts', async () => {
    const run = await makeRun(910004, 'as-guid-4');
    const stage = createArtifactStage({
      db: client.db,
      github: stubGitHub([
        { id: 73, name: 'expired-artifact', expired: true },
        { id: 74, name: 'huge-artifact', size: 999_999_999 },
      ]),
      maxArtifactBytes: 10_000_000,
      maxXmlEntryBytes: 1_000_000,
    });

    await stage(run, log);

    const rows = await client.db.execute(
      sql`SELECT github_artifact_id, skipped_reason FROM run_artifacts
          WHERE workflow_run_id = ${run.workflowRunId} ORDER BY github_artifact_id`,
    );
    expect(rows.rows[0]?.skipped_reason).toBe('expired');
    expect(rows.rows[1]?.skipped_reason).toContain('too_large');
  });
});
