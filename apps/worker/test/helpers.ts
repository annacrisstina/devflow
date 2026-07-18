import { fileURLToPath } from 'node:url';

import { createDbClient, type DbClient } from '@devflow/db/client';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const BASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';

export const REDIS_URL = process.env.DEVFLOW_REDIS_URL ?? 'redis://127.0.0.1:6379';

/** Own throwaway database per suite; migrations build the schema under test. */
export async function createTestDb(database: string): Promise<DbClient> {
  const admin = createDbClient(BASE_URL);
  await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`));
  await admin.db.execute(sql.raw(`CREATE DATABASE ${database}`));
  await admin.close();

  const url = new URL(BASE_URL);
  url.pathname = `/${database}`;
  const client = createDbClient(url.toString());
  await migrate(client.db, {
    // Monorepo-relative: migrations are dev-time data of @devflow/db.
    migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)),
  });
  return client;
}
