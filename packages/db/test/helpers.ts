import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDbClient, type DbClient } from '../src/client.js';

const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';

/**
 * Recreates a throwaway database and builds its schema from the committed
 * migrations — the migrations themselves are part of what's under test.
 */
export async function createTestDb(database: string): Promise<DbClient> {
  const admin = createDbClient(BASE_URL);
  await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`));
  await admin.db.execute(sql.raw(`CREATE DATABASE ${database}`));
  await admin.close();

  const url = new URL(BASE_URL);
  url.pathname = `/${database}`;
  const client = createDbClient(url.toString());
  await migrate(client.db, {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
  return client;
}
