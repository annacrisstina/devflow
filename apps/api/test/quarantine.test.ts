import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createDbClient } from '@devflow/db/client';
import { sessions, users } from '@devflow/db/schema/auth';
import { testFlakeScores } from '@devflow/db/schema/flake-scores';
import { repositories } from '@devflow/db/schema/runs';
import { installations, workspaceMembers, workspaces } from '@devflow/db/schema/tenancy';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { testConfig } from './test-config.js';

const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const TEST_DB = 'devflow_api_quarantine_test';

function withDatabase(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

let app: Awaited<ReturnType<typeof buildApp>>;
const anaToken = randomUUID();
const malloryToken = randomUUID();
let ws1: bigint;
let flakyScoreId: bigint;
let dismissableScoreId: bigint;
let liftableScoreId: bigint;
let foreignScoreId: bigint;

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
  const db = app.db;

  const [ana, mallory] = await db
    .insert(users)
    .values([{ name: 'Ana' }, { name: 'Mallory' }])
    .returning();
  const expires = new Date(Date.now() + 3_600_000);
  await db.insert(sessions).values([
    { sessionToken: anaToken, userId: ana!.id, expires },
    { sessionToken: malloryToken, userId: mallory!.id, expires },
  ]);
  const [w1, w2] = await db
    .insert(workspaces)
    .values([
      { name: 'Ana Space', createdBy: ana!.id },
      { name: 'Mallory Space', createdBy: mallory!.id },
    ])
    .returning();
  ws1 = w1!.id;
  await db.insert(workspaceMembers).values([
    { workspaceId: ws1, userId: ana!.id, role: 'owner' },
    { workspaceId: w2!.id, userId: mallory!.id, role: 'owner' },
  ]);
  await db.insert(installations).values([
    { githubInstallationId: 8801n, workspaceId: ws1 },
    { githubInstallationId: 8802n, workspaceId: w2!.id },
  ]);
  const [repoA, repoB] = await db
    .insert(repositories)
    .values([
      {
        githubRepoId: 11n,
        installationId: 8801n,
        owner: 'annacrisstina',
        name: 'alpha',
        private: false,
      },
      { githubRepoId: 12n, installationId: 8802n, owner: 'mallory', name: 'beta', private: false },
    ])
    .returning();

  const score = (repositoryId: bigint, testName: string, value: number) => ({
    repositoryId,
    suiteName: 'suite',
    className: 'C',
    testName,
    score: value,
    verdict: value >= 0.5 ? 'flaky' : value >= 0.25 ? 'suspected' : 'healthy',
    divergenceEvidence: 2,
    transitionEvidence: 0,
    lastFailureAt: new Date(),
    computedAt: new Date(),
  });
  const scores = await db
    .insert(testFlakeScores)
    .values([
      score(repoA!.id, 'approve me', 0.7),
      score(repoA!.id, 'dismiss me', 0.6),
      score(repoA!.id, 'lift me', 0.55),
      score(repoA!.id, 'not flaky enough', 0.3),
      score(repoB!.id, 'mallory test', 0.8),
    ])
    .returning();
  flakyScoreId = scores[0]!.id;
  dismissableScoreId = scores[1]!.id;
  liftableScoreId = scores[2]!.id;
  foreignScoreId = scores[4]!.id;
});

afterAll(async () => {
  await app.close();
});

async function proposals() {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${ws1}/quarantine/proposals`,
    headers: cookie(anaToken),
  });
  expect(response.statusCode).toBe(200);
  return response.json().items as Array<{ testName: string }>;
}

describe('quarantine workflow', () => {
  it('proposals = effective-flaky tests with no record (suspected excluded)', async () => {
    const items = await proposals();
    expect(items.map((i) => i.testName).sort()).toEqual(['approve me', 'dismiss me', 'lift me']);
  });

  it('approve creates an active record and removes the proposal', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws1}/quarantine`,
      headers: cookie(anaToken),
      payload: {
        scoreId: flakyScoreId.toString(),
        action: 'approve',
        reason: 'known network flake',
      },
    });
    expect(response.statusCode).toBe(201);

    expect((await proposals()).map((i) => i.testName)).not.toContain('approve me');

    const active = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/quarantine?status=active`,
      headers: cookie(anaToken),
    });
    const items = active.json().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      testName: 'approve me',
      status: 'active',
      reason: 'known network flake',
      createdBy: 'Ana',
    });
  });

  it('double-approve is a 409, not a duplicate record', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws1}/quarantine`,
      headers: cookie(anaToken),
      payload: { scoreId: flakyScoreId.toString(), action: 'approve' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('already_quarantined');
  });

  it('dismiss suppresses the proposal and appears under ?status=dismissed', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws1}/quarantine`,
      headers: cookie(anaToken),
      payload: { scoreId: dismissableScoreId.toString(), action: 'dismiss', reason: 'just broken' },
    });
    expect(response.statusCode).toBe(201);
    expect((await proposals()).map((i) => i.testName)).not.toContain('dismiss me');

    const dismissed = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/quarantine?status=dismissed`,
      headers: cookie(anaToken),
    });
    expect(dismissed.json().items[0]).toMatchObject({
      testName: 'dismiss me',
      status: 'dismissed',
    });
  });

  it('a dismissed identity can still be approved (dismissal is reversible)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws1}/quarantine`,
      headers: cookie(anaToken),
      payload: { scoreId: dismissableScoreId.toString(), action: 'approve' },
    });
    expect(response.statusCode).toBe(201);
  });

  it('lift retires an active record and the identity can be re-proposed', async () => {
    const approve = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws1}/quarantine`,
      headers: cookie(anaToken),
      payload: { scoreId: liftableScoreId.toString(), action: 'approve' },
    });
    const recordId = approve.json().id;

    const lift = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws1}/quarantine/${recordId}/lift`,
      headers: cookie(anaToken),
    });
    expect(lift.statusCode).toBe(200);
    expect(lift.json()).toMatchObject({ status: 'lifted' });

    // No active/dismissed record remains for this identity → proposed again.
    expect((await proposals()).map((i) => i.testName)).toContain('lift me');

    const liftedAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws1}/quarantine/${recordId}/lift`,
      headers: cookie(anaToken),
    });
    expect(liftedAgain.statusCode).toBe(409);
  });

  it('cross-tenant: foreign scoreId is invisible (404) and endpoints deny non-members', async () => {
    const approveForeign = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws1}/quarantine`,
      headers: cookie(anaToken),
      payload: { scoreId: foreignScoreId.toString(), action: 'approve' },
    });
    expect(approveForeign.statusCode).toBe(404);

    for (const url of [
      `/api/v1/workspaces/${ws1}/quarantine/proposals`,
      `/api/v1/workspaces/${ws1}/quarantine`,
    ]) {
      const denied = await app.inject({ method: 'GET', url, headers: cookie(malloryToken) });
      expect(denied.statusCode).toBe(404);
    }
  });

  it('unauthenticated requests get 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws1}/quarantine/proposals`,
    });
    expect(response.statusCode).toBe(401);
  });
});
