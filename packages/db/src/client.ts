import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { accounts, sessions, users, verificationTokens } from './schema/auth.js';
import { testFlakeScores } from './schema/flake-scores.js';
import { quarantineRecords } from './schema/quarantine.js';
import { repositories, runArtifacts, testResults, workflowRuns } from './schema/runs.js';
import { installations, workspaceMembers, workspaces } from './schema/tenancy.js';
import { webhookEvents } from './schema/webhook-events.js';

const schema = {
  webhookEvents,
  repositories,
  workflowRuns,
  runArtifacts,
  testResults,
  testFlakeScores,
  users,
  accounts,
  sessions,
  verificationTokens,
  workspaces,
  workspaceMembers,
  installations,
  quarantineRecords,
};

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export type DbClient = {
  db: Db;
  /** Drains the pool. Call on graceful shutdown; the client is unusable after. */
  close: () => Promise<void>;
};

/**
 * One client per process. Pool sizing stays at pg defaults until a real
 * workload gives us a reason to tune it.
 */
export function createDbClient(connectionString: string): DbClient {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return {
    db,
    close: () => pool.end(),
  };
}
