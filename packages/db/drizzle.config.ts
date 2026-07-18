import { defineConfig } from 'drizzle-kit';

// Fallback matches the compose.yaml defaults so `pnpm db:generate` and
// `pnpm db:migrate` work out of the box on a fresh dev machine.
const DEFAULT_LOCAL_URL = 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/webhook-events.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DEVFLOW_DATABASE_URL ?? DEFAULT_LOCAL_URL,
  },
});
