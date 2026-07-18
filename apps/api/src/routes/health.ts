import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async (request, reply) => {
    try {
      await app.db.execute(sql`select 1`);
    } catch (error) {
      request.log.error({ err: error }, 'health check failed: database unreachable');
      return reply.status(503).send({ status: 'unavailable' });
    }
    return { status: 'ok' };
  });
};
