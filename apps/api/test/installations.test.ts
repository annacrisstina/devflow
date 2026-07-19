import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createDbClient } from '@devflow/db/client';
import { sessions, users } from '@devflow/db/schema/auth';
import { installations, workspaceMembers, workspaces } from '@devflow/db/schema/tenancy';
import { PROCESS_INSTALLATION_EVENT } from '@devflow/queue/ingest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { createInstallState } from '../src/github/install-state.js';
import { testConfig } from './test-config.js';

const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const TEST_DB = 'devflow_api_install_test';

function withDatabase(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

const config = testConfig();
let app: Awaited<ReturnType<typeof buildApp>>;
const anaToken = randomUUID();
const malloryToken = randomUUID();
let anaId: string;
let ws1: bigint;
let ws2: bigint;

function cookie(token: string) {
  return { cookie: `authjs.session-token=${token}` };
}

beforeAll(async () => {
  const admin = createDbClient(BASE_URL);
  await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`));
  await admin.db.execute(sql.raw(`CREATE DATABASE ${TEST_DB}`));
  await admin.close();

  const testDbUrl = withDatabase(BASE_URL, TEST_DB);
  const migrationClient = createDbClient(testDbUrl);
  await migrate(migrationClient.db, {
    migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)),
  });
  await migrationClient.close();

  app = await buildApp(testConfig({ databaseUrl: testDbUrl }));
  await app.ingestQueue.obliterate({ force: true });

  const [ana, mallory] = await app.db
    .insert(users)
    .values([{ name: 'Ana' }, { name: 'Mallory' }])
    .returning();
  anaId = ana!.id;
  const expires = new Date(Date.now() + 3_600_000);
  await app.db.insert(sessions).values([
    { sessionToken: anaToken, userId: ana!.id, expires },
    { sessionToken: malloryToken, userId: mallory!.id, expires },
  ]);
  const [w1, w2] = await app.db
    .insert(workspaces)
    .values([
      { name: 'Ana Space', createdBy: ana!.id },
      { name: 'Mallory Space', createdBy: mallory!.id },
    ])
    .returning();
  ws1 = w1!.id;
  ws2 = w2!.id;
  await app.db.insert(workspaceMembers).values([
    { workspaceId: ws1, userId: ana!.id, role: 'owner' },
    { workspaceId: ws2, userId: mallory!.id, role: 'owner' },
  ]);

  // A pre-M4-style backfilled row: known id, unclaimed, no account data.
  await app.db.insert(installations).values({ githubInstallationId: 7001n });
  // An installation already owned by Mallory's workspace.
  await app.db.insert(installations).values({ githubInstallationId: 7002n, workspaceId: ws2 });
});

afterAll(async () => {
  await app.ingestQueue.obliterate({ force: true });
  await app.close();
});

async function installationRow(id: bigint) {
  const rows = await app.db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, id));
  return rows[0];
}

describe('POST /api/v1/workspaces/:id/installations/link', () => {
  it('returns a GitHub install URL carrying a verifiable state', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws1}/installations/link`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(200);
    const { installUrl } = response.json();
    expect(installUrl).toContain(
      'https://github.com/apps/devflow-dev-test/installations/new?state=',
    );
  });

  it('cross-tenant: 404 for non-members', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws1}/installations/link`,
      headers: cookie(malloryToken),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/github/setup (claim callback)', () => {
  function stateFor(workspaceId: bigint, userId: string): string {
    return createInstallState(config.authSecret, workspaceId, userId);
  }

  it('claims an unclaimed installation and redirects into the workspace', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/github/setup?installation_id=7001&state=${stateFor(ws1, anaId)}`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`/workspaces/${ws1}?connected=1`);
    expect((await installationRow(7001n))?.workspaceId).toBe(ws1);
  });

  it('is idempotent for an installation already claimed by the same workspace', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/github/setup?installation_id=7001&state=${stateFor(ws1, anaId)}`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`/workspaces/${ws1}?connected=1`);
  });

  it("refuses to steal another workspace's installation", async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/github/setup?installation_id=7002&state=${stateFor(ws1, anaId)}`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/?install_error=already_claimed');
    expect((await installationRow(7002n))?.workspaceId).toBe(ws2);
  });

  it('creates the row for a fresh install whose webhook has not landed yet', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/github/setup?installation_id=7003&state=${stateFor(ws1, anaId)}`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(302);
    expect((await installationRow(7003n))?.workspaceId).toBe(ws1);
  });

  it('rejects a state belonging to a different logged-in user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/github/setup?installation_id=7001&state=${stateFor(ws1, anaId)}`,
      headers: cookie(malloryToken),
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/?install_error=invalid_state');
  });

  it('rejects a tampered state and leaves rows untouched', async () => {
    await app.db.insert(installations).values({ githubInstallationId: 7004n });
    const response = await app.inject({
      method: 'GET',
      url: `/api/github/setup?installation_id=7004&state=garbage.morediscarded`,
      headers: cookie(anaToken),
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/?install_error=invalid_state');
    expect((await installationRow(7004n))?.workspaceId).toBeNull();
  });

  it('requires a session (the redirect arrives in the claiming browser)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/github/setup?installation_id=7001&state=${stateFor(ws1, anaId)}`,
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('installation webhooks enqueue worker jobs', () => {
  const SECRET = 'test-webhook-secret';

  it('a signed installation.created delivery becomes a process-installation-event job', async () => {
    const body = Buffer.from(
      JSON.stringify({
        action: 'created',
        installation: { id: 7100, account: { login: 'annacrisstina', type: 'User' } },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-delivery': randomUUID(),
        'x-github-event': 'installation',
        'x-hub-signature-256': `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`,
      },
      payload: body,
    });
    expect(response.statusCode).toBe(202);

    const eventId = (
      await app.db.execute(
        sql`SELECT id FROM webhook_events WHERE event_type = 'installation' ORDER BY id DESC LIMIT 1`,
      )
    ).rows[0]?.id as string;
    const job = await app.ingestQueue.getJob(`evt-${eventId}`);
    expect(job).toBeDefined();
    expect(job?.name).toBe(PROCESS_INSTALLATION_EVENT);
  });
});
