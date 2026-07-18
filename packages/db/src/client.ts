import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { webhookEvents } from './schema/webhook-events.js';

const schema = { webhookEvents };

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
