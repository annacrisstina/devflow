import { createDbClient, type Db } from '@devflow/db/client';
import { fastify, type FastifyInstance } from 'fastify';

import type { ApiConfig } from './config.js';
import { healthRoutes } from './routes/health.js';
import { webhookRoutes } from './routes/webhooks.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
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
  app.addHook('onClose', async () => {
    await dbClient.close();
  });

  await app.register(healthRoutes);
  await app.register(webhookRoutes, { webhookSecret: config.webhookSecret });

  return app;
}
