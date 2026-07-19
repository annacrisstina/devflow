import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import type { LiveEvent } from '@devflow/contract/events';
import { createDbClient } from '@devflow/db/client';
import { sessions, users } from '@devflow/db/schema/auth';
import { workspaceMembers, workspaces } from '@devflow/db/schema/tenancy';
import { createRedisConnection } from '@devflow/queue/connection';
import { LIVE_EVENTS_CHANNEL } from '@devflow/queue/live';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { testConfig } from './test-config.js';

const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const REDIS_URL = process.env.DEVFLOW_REDIS_URL ?? 'redis://127.0.0.1:6379';
const TEST_DB = 'devflow_api_live_test';

function withDatabase(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

let app: Awaited<ReturnType<typeof buildApp>>;
let baseAddress: string;
let publisher: ReturnType<typeof createRedisConnection>;
const anaToken = randomUUID();
let ws1: bigint;
let ws2: bigint;

function connectClient(cookie?: string): Socket {
  return ioClient(baseAddress, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: cookie === undefined ? {} : { cookie },
  });
}

function liveEvent(workspaceId: bigint, type: LiveEvent['type']): LiveEvent {
  return {
    type,
    workspaceId: workspaceId.toString(),
    repository: 'annacrisstina/alpha',
    githubRunId: '9001',
    runAttempt: 1,
    at: new Date().toISOString(),
    processingStatus: 'succeeded',
  };
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
  // Socket.IO needs a real listening server (inject() cannot upgrade).
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  baseAddress = `http://127.0.0.1:${address.port}`;

  const [ana] = await app.db
    .insert(users)
    .values([{ name: 'Ana' }])
    .returning();
  await app.db.insert(sessions).values({
    sessionToken: anaToken,
    userId: ana!.id,
    expires: new Date(Date.now() + 3_600_000),
  });
  const [w1, w2] = await app.db
    .insert(workspaces)
    .values([
      { name: 'Ana Space', createdBy: ana!.id },
      { name: 'Other Space', createdBy: ana!.id },
    ])
    .returning();
  ws1 = w1!.id;
  ws2 = w2!.id;
  // Ana is a member of ws1 only; ws2 exists to prove room isolation.
  await app.db
    .insert(workspaceMembers)
    .values({ workspaceId: ws1, userId: ana!.id, role: 'owner' });

  publisher = createRedisConnection(REDIS_URL);
});

afterAll(async () => {
  await publisher.quit();
  await app.close();
});

describe('live feed (ADR-0015)', () => {
  it('rejects an unauthenticated handshake', async () => {
    const socket = connectClient();
    const error = await new Promise<Error>((resolve) => {
      socket.on('connect_error', resolve);
    });
    expect(error.message).toBe('unauthenticated');
    socket.close();
  });

  it('delivers events for workspaces the user belongs to — and only those', async () => {
    const socket = connectClient(`authjs.session-token=${anaToken}`);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });

    const received: LiveEvent[] = [];
    socket.on('run.processed', (event: LiveEvent) => received.push(event));

    // Wrong-workspace event first: if isolation leaked, it would arrive
    // before (or alongside) the right one and fail the assertion below.
    await publisher.publish(LIVE_EVENTS_CHANNEL, JSON.stringify(liveEvent(ws2, 'run.processed')));
    await publisher.publish(LIVE_EVENTS_CHANNEL, JSON.stringify(liveEvent(ws1, 'run.processed')));

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no event within 5s')), 5000);
      const poll = setInterval(() => {
        if (received.length > 0) {
          clearTimeout(timer);
          clearInterval(poll);
          resolve();
        }
      }, 25);
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      workspaceId: ws1.toString(),
      repository: 'annacrisstina/alpha',
      processingStatus: 'succeeded',
    });
    socket.close();
  });

  it('drops malformed messages without killing the stream', async () => {
    const socket = connectClient(`authjs.session-token=${anaToken}`);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    const received: LiveEvent[] = [];
    socket.on('scores.updated', (event: LiveEvent) => received.push(event));

    await publisher.publish(LIVE_EVENTS_CHANNEL, 'not json at all');
    await publisher.publish(LIVE_EVENTS_CHANNEL, JSON.stringify(liveEvent(ws1, 'scores.updated')));

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no event within 5s')), 5000);
      const poll = setInterval(() => {
        if (received.length > 0) {
          clearTimeout(timer);
          clearInterval(poll);
          resolve();
        }
      }, 25);
    });
    expect(received[0]?.type).toBe('scores.updated');
    socket.close();
  });
});
