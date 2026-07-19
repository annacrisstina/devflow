import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DbClient } from '../src/client.js';
import { users } from '../src/schema/auth.js';
import { quarantineRecords } from '../src/schema/quarantine.js';
import { repositories } from '../src/schema/runs.js';
import { installations, workspaceMembers, workspaces } from '../src/schema/tenancy.js';
import { createTestDb } from './helpers.js';

let client: DbClient;
let userId: string;
let workspaceId: bigint;
let repositoryId: bigint;

beforeAll(async () => {
  client = await createTestDb('devflow_test_tenancy');

  // Simulates an M3-era deployment: repositories exist before the tenancy
  // tables' backfill runs. The migration has already run inside createTestDb,
  // so the backfill assertion below re-runs its statement against data
  // inserted afterwards to prove the statement itself, plus the shape it
  // leaves behind.
  const repo = await client.db
    .insert(repositories)
    .values({
      githubRepoId: 42n,
      installationId: 7001n,
      owner: 'annacrisstina',
      name: 'devflow',
      private: false,
    })
    .returning();
  repositoryId = repo[0]!.id;

  const user = await client.db
    .insert(users)
    .values({ name: 'Ana', email: 'ana@example.com' })
    .returning();
  userId = user[0]!.id;

  const ws = await client.db
    .insert(workspaces)
    .values({ name: 'Personal', createdBy: userId })
    .returning();
  workspaceId = ws[0]!.id;
});

afterAll(async () => {
  await client.close();
});

describe('users (Auth.js adapter contract)', () => {
  it('generates text UUID ids application-side', () => {
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('installations backfill', () => {
  it('creates unclaimed rows for pre-existing repository installations', async () => {
    // Re-run the migration's backfill statement now that a repository exists.
    await client.db.execute(sql`
      INSERT INTO installations (github_installation_id)
      SELECT DISTINCT installation_id FROM repositories
      ON CONFLICT (github_installation_id) DO NOTHING
    `);

    const rows = await client.db.select().from(installations);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.githubInstallationId).toBe(7001n);
    expect(rows[0]?.workspaceId).toBeNull();
    expect(rows[0]?.accountLogin).toBeNull();
  });

  it('is idempotent (rerun converges, no duplicates)', async () => {
    await client.db.execute(sql`
      INSERT INTO installations (github_installation_id)
      SELECT DISTINCT installation_id FROM repositories
      ON CONFLICT (github_installation_id) DO NOTHING
    `);
    const rows = await client.db.execute(
      sql`SELECT count(*)::int AS n FROM installations WHERE github_installation_id = 7001`,
    );
    expect(rows.rows[0]?.n).toBe(1);
  });
});

describe('workspace membership', () => {
  it('enforces one membership row per (workspace, user)', async () => {
    await client.db.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' });
    // Drizzle wraps the pg error; the violated constraint is on the cause.
    await expect(
      client.db.insert(workspaceMembers).values({ workspaceId, userId, role: 'member' }),
    ).rejects.toMatchObject({ cause: { constraint: 'workspace_members_workspace_user_idx' } });
  });

  it('claiming binds an installation to a workspace', async () => {
    const claimed = await client.db
      .update(installations)
      .set({ workspaceId, updatedAt: new Date() })
      .where(sql`github_installation_id = 7001 AND workspace_id IS NULL`)
      .returning();
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.workspaceId).toBe(workspaceId);
  });

  it('an already-claimed installation cannot be re-claimed by the same guard', async () => {
    const reclaimed = await client.db
      .update(installations)
      .set({ workspaceId })
      .where(sql`github_installation_id = 7001 AND workspace_id IS NULL`)
      .returning();
    expect(reclaimed).toHaveLength(0);
  });
});

describe('quarantine_records', () => {
  const identity = {
    suiteName: 'suite',
    className: 'Class',
    testName: 'flaky test',
  };

  it('allows at most one ACTIVE record per identity (partial unique index)', async () => {
    await client.db
      .insert(quarantineRecords)
      .values({ repositoryId, ...identity, status: 'active', createdBy: userId });
    await expect(
      client.db
        .insert(quarantineRecords)
        .values({ repositoryId, ...identity, status: 'active', createdBy: userId }),
    ).rejects.toMatchObject({ cause: { constraint: 'quarantine_records_active_identity_idx' } });
  });

  it('history rows (dismissed/lifted) are not blocked by the partial index', async () => {
    await client.db
      .insert(quarantineRecords)
      .values({ repositoryId, ...identity, status: 'dismissed', createdBy: userId });
    await client.db
      .insert(quarantineRecords)
      .values({ repositoryId, ...identity, status: 'lifted', createdBy: userId });

    const rows = await client.db.execute(
      sql`SELECT count(*)::int AS n FROM quarantine_records WHERE test_name = ${identity.testName}`,
    );
    expect(rows.rows[0]?.n).toBe(3);
  });

  it('lifting frees the identity for a future active record', async () => {
    await client.db
      .update(quarantineRecords)
      .set({ status: 'lifted', liftedBy: userId, liftedAt: new Date() })
      .where(sql`status = 'active' AND test_name = ${identity.testName}`);

    const again = await client.db
      .insert(quarantineRecords)
      .values({ repositoryId, ...identity, status: 'active', createdBy: userId })
      .returning();
    expect(again).toHaveLength(1);
  });
});
