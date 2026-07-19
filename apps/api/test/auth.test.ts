import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createDbClient } from '@devflow/db/client';
import { sessions, users } from '@devflow/db/schema/auth';
import { workspaceMembers, workspaces } from '@devflow/db/schema/tenancy';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { testConfig } from './test-config.js';

const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const TEST_DB = 'devflow_api_auth_test';

function withDatabase(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

let app: Awaited<ReturnType<typeof buildApp>>;
let userId: string;
let otherUserId: string;
let workspaceId: bigint;
const sessionToken = randomUUID();
const expiredToken = randomUUID();
const otherSessionToken = randomUUID();

function sessionCookie(token: string): string {
  return `authjs.session-token=${token}`;
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

  // Sessions are inserted directly: with the database strategy the cookie
  // value is the session row key, so tests need no OAuth dance (ADR-0013).
  const inserted = await app.db
    .insert(users)
    .values([{ name: 'Ana' }, { name: 'Mallory' }])
    .returning();
  userId = inserted[0]!.id;
  otherUserId = inserted[1]!.id;

  const inAnHour = new Date(Date.now() + 60 * 60 * 1000);
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await app.db.insert(sessions).values([
    { sessionToken, userId, expires: inAnHour },
    { sessionToken: expiredToken, userId, expires: anHourAgo },
    { sessionToken: otherSessionToken, userId: otherUserId, expires: inAnHour },
  ]);

  const ws = await app.db
    .insert(workspaces)
    .values({ name: 'Personal', createdBy: userId })
    .returning();
  workspaceId = ws[0]!.id;
  await app.db.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' });
});

afterAll(async () => {
  await app.close();
});

describe('Auth.js mount (@auth/core on Fastify)', () => {
  it('serves the provider list with GitHub configured', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/providers' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ github: { id: 'github', type: 'oauth' } });
  });

  it('issues a CSRF token with its cookie', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/csrf' });
    expect(response.statusCode).toBe(200);
    expect(response.json().csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('resolves a database session through the Auth.js session endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: sessionCookie(sessionToken) },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()?.user?.name).toBe('Ana');
  });
});

describe('GET /api/v1/me', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'unauthenticated', message: 'Sign in to use the API.' },
    });
  });

  it('rejects an expired session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: sessionCookie(expiredToken) },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects an unknown session token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: sessionCookie(randomUUID()) },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns the user and their workspaces for a valid session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: sessionCookie(sessionToken) },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.name).toBe('Ana');
    expect(body.workspaces).toEqual([
      { id: workspaceId.toString(), name: 'Personal', role: 'owner' },
    ]);
  });

  it('cross-tenant: another user sees no workspaces they are not a member of', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: sessionCookie(otherSessionToken) },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().workspaces).toEqual([]);
  });
});
