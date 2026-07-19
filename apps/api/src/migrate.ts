import { createDbClient } from '@devflow/db/client';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/**
 * One-shot migration runner (ADR-0020): the compose `migrate` service runs
 * this and exits; api/worker wait for it. Uses drizzle's programmatic
 * migrator over the committed SQL files — the exact same code path the
 * integration tests build every schema from, and no drizzle-kit in the
 * production image.
 *
 * Deliberately does NOT load the app config: migrations need the database
 * URL and nothing else — a migrate run must not demand OAuth secrets.
 */
const databaseUrl =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';
const migrationsFolder = process.env.DEVFLOW_MIGRATIONS_DIR ?? '/app/migrations';

const client = createDbClient(databaseUrl);
try {
  await migrate(client.db, { migrationsFolder });
  console.log(JSON.stringify({ msg: 'migrations applied', migrationsFolder }));
} finally {
  await client.close();
}
