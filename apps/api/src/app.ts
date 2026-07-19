import { createDbClient, type Db } from '@devflow/db/client';
import { createRedisConnection } from '@devflow/queue/connection';
import { createIngestQueue, type IngestQueue } from '@devflow/queue/ingest';
import { fastify, type FastifyInstance } from 'fastify';

import { authJsPlugin } from './auth/authjs-plugin.js';
import type { ApiConfig } from './config.js';
import { healthRoutes } from './routes/health.js';
import { flakyTestRoutes } from './routes/v1/flaky-tests.js';
import { installationRoutes } from './routes/v1/installations.js';
import { meRoutes } from './routes/v1/me.js';
import { runRoutes } from './routes/v1/runs.js';
import { workspaceRoutes } from './routes/v1/workspaces.js';
import { webhookRoutes } from './routes/webhooks.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    ingestQueue: IngestQueue;
  }
}

/**
 * Builds a fully wired but not-yet-listening app. Separated from server.ts so
 * tests exercise the real instance via inject() without binding a port.
 */
export async function buildApp(config: ApiConfig): Promise<FastifyInstance> {
  const app = fastify({
    logger: { level: config.logLevel },
    // Fastify generates its own request ids; webhook deliveries additionally
    // log GitHub's delivery GUID (the cross-system correlation key).
  });

  const dbClient = createDbClient(config.databaseUrl);
  app.decorate('db', dbClient.db);

  const redis = createRedisConnection(config.redisUrl);
  app.decorate('ingestQueue', createIngestQueue(redis));

  app.addHook('onClose', async () => {
    await app.ingestQueue.close();
    await redis.quit();
    await dbClient.close();
  });

  await app.register(healthRoutes);
  await app.register(webhookRoutes, { webhookSecret: config.webhookSecret });
  await app.register(authJsPlugin, { config });
  await app.register(meRoutes);
  await app.register(workspaceRoutes);
  await app.register(flakyTestRoutes, { flake: config.flake });
  await app.register(runRoutes);
  await app.register(installationRoutes, { config });

  return app;
}
