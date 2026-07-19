import type { LiveEvent } from '@devflow/contract/events';
import { installations } from '@devflow/db/schema/tenancy';
import { createRedisConnection } from '@devflow/queue/connection';
import { LIVE_EVENTS_CHANNEL } from '@devflow/queue/live';
import { sql } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createLivePublisher } from '../src/live/publisher.js';
import type { NormalizedRun } from '../src/pipeline/normalize-run.js';
import { createTestDb, REDIS_URL } from './helpers.js';

const log = pino({ level: 'silent' });

let client: Awaited<ReturnType<typeof createTestDb>>;
let publisherConn: ReturnType<typeof createRedisConnection>;
let subscriberConn: ReturnType<typeof createRedisConnection>;
const received: LiveEvent[] = [];

function run(installationId: bigint): NormalizedRun {
  return {
    repositoryId: 1n,
    workflowRunId: 1n,
    installationId,
    owner: 'annacrisstina',
    repo: 'alpha',
    githubRunId: 9001n,
    runAttempt: 2,
    headSha: 'sha-live',
    defaultBranch: 'main',
  };
}

async function waitForEvents(count: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`expected ${count} events within 5s`)), 5000);
    const poll = setInterval(() => {
      if (received.length >= count) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve();
      }
    }, 25);
  });
}

beforeAll(async () => {
  client = await createTestDb('devflow_worker_live_test');
  await client.db.execute(sql`
    INSERT INTO users (id, name) VALUES ('u-live', 'Ana');
    `);
  await client.db.execute(sql`
    INSERT INTO workspaces (name, created_by) VALUES ('Live WS', 'u-live');
  `);
  const ws = await client.db.execute(sql`SELECT id FROM workspaces LIMIT 1`);
  const wsId = ws.rows[0]!.id as string;
  await client.db
    .insert(installations)
    .values([
      { githubInstallationId: 5100n, workspaceId: BigInt(wsId) },
      { githubInstallationId: 5200n },
    ]);

  publisherConn = createRedisConnection(REDIS_URL);
  subscriberConn = createRedisConnection(REDIS_URL);
  await subscriberConn.subscribe(LIVE_EVENTS_CHANNEL);
  subscriberConn.on('message', (_channel: string, raw: string) => {
    received.push(JSON.parse(raw) as LiveEvent);
  });
});

afterAll(async () => {
  await subscriberConn.quit();
  await client.close();
});

describe('live publisher (ADR-0015)', () => {
  it('publishes run lifecycle events with the resolved workspace id', async () => {
    const publisher = createLivePublisher(client.db, publisherConn);
    await publisher.runIngested(run(5100n), log);
    await publisher.runProcessed(run(5100n), 'succeeded', log);
    await publisher.scoresUpdated(run(5100n), log);
    await waitForEvents(3);

    expect(received.map((e) => e.type)).toEqual([
      'run.ingested',
      'run.processed',
      'scores.updated',
    ]);
    expect(received[1]).toMatchObject({
      repository: 'annacrisstina/alpha',
      githubRunId: '9001',
      runAttempt: 2,
      processingStatus: 'succeeded',
    });
    expect(received[0]?.workspaceId).toMatch(/^\d+$/);
  });

  it('publishes nothing for unclaimed installations', async () => {
    const before = received.length;
    const publisher = createLivePublisher(client.db, publisherConn);
    await publisher.runProcessed(run(5200n), 'succeeded', log);
    // Give a real publish time to arrive if one were (wrongly) sent.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received.length).toBe(before);
  });

  it('swallows publish failures (fire-and-forget contract)', async () => {
    const publisher = createLivePublisher(client.db, publisherConn);
    await publisherConn.quit();
    await expect(publisher.runProcessed(run(5100n), 'succeeded', log)).resolves.toBeUndefined();
  });
});
