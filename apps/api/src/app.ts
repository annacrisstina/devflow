import fastifyStatic from '@fastify/static';
import { createEmbedder, type Embedder } from '@devflow/ai/embedder';
import { createAnthropicProvider } from '@devflow/ai/llm';
import { createDbClient, type Db } from '@devflow/db/client';
import { createRedisConnection } from '@devflow/queue/connection';
import { createIngestQueue, type IngestQueue } from '@devflow/queue/ingest';
import { fastify, type FastifyInstance } from 'fastify';

import { authJsPlugin } from './auth/authjs-plugin.js';
import { registerMetrics } from './http/metrics-plugin.js';
import type { ApiConfig } from './config.js';
import { liveFeedPlugin } from './live/socket-plugin.js';
import { healthRoutes } from './routes/health.js';
import { flakyTestRoutes } from './routes/v1/flaky-tests.js';
import { hypothesisRoutes } from './routes/v1/hypothesis.js';
import { insightsRoutes } from './routes/v1/insights.js';
import { installationRoutes } from './routes/v1/installations.js';
import { meRoutes } from './routes/v1/me.js';
import { quarantineRoutes } from './routes/v1/quarantine.js';
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
export type BuildAppOverrides = {
  /** Test seam: inject a deterministic embedder instead of the real model. */
  embedder?: Embedder;
};

export async function buildApp(
  config: ApiConfig,
  overrides: BuildAppOverrides = {},
): Promise<FastifyInstance> {
  const app = fastify({
    logger: { level: config.logLevel },
    // Behind a TLS-terminating proxy the forwarded headers carry the real
    // client/protocol (self-hosting guide); off by default for direct dev.
    trustProxy: config.trustProxy,
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
  registerMetrics(app);
  await app.register(webhookRoutes, { webhookSecret: config.webhookSecret });
  await app.register(authJsPlugin, { config });
  // Lazy: the model loads on the first search, not at boot (ADR-0018).
  const embedder = config.ai.embeddings
    ? (overrides.embedder ?? createEmbedder({ modelDir: config.ai.modelDir }))
    : undefined;

  await app.register(meRoutes, {
    features: {
      aiSearch: config.ai.embeddings,
      aiHypotheses: config.ai.apiKey !== undefined,
    },
  });
  await app.register(workspaceRoutes);
  await app.register(flakyTestRoutes, { flake: config.flake });
  await app.register(runRoutes);
  await app.register(installationRoutes, { config });
  await app.register(quarantineRoutes, { flake: config.flake });
  await app.register(insightsRoutes, {
    embedder,
    clusterThreshold: config.ai.clusterThreshold,
  });
  // BYO key (ADR-0019): no key, no provider, feature cleanly off.
  await app.register(hypothesisRoutes, {
    provider:
      config.ai.apiKey === undefined
        ? undefined
        : createAnthropicProvider({
            apiKey: config.ai.apiKey,
            model: config.ai.model,
            baseUrl: config.ai.baseUrl,
          }),
    flake: config.flake,
  });
  await app.register(liveFeedPlugin, { redisUrl: config.redisUrl });

  // Self-hosted deployments serve the built SPA from the same origin
  // (ADR-0013's cookie model). Dev and tests leave DEVFLOW_WEB_DIST unset —
  // Vite's dev server owns the SPA there.
  if (config.webDist !== undefined) {
    await app.register(fastifyStatic, { root: config.webDist });
    app.setNotFoundHandler(async (request, reply) => {
      // SPA fallback for browser navigation only; API misses stay JSON 404s.
      const isApiPath =
        request.url.startsWith('/api') ||
        request.url.startsWith('/webhooks') ||
        request.url.startsWith('/healthz') ||
        request.url.startsWith('/socket.io');
      if (request.method === 'GET' && !isApiPath) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } });
    });
  }

  return app;
}
