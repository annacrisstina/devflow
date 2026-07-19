import type { LiveEvent } from '@devflow/contract/events';
import { workspaceMembers } from '@devflow/db/schema/tenancy';
import { createRedisConnection } from '@devflow/queue/connection';
import { LIVE_EVENTS_CHANNEL } from '@devflow/queue/live';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { Server } from 'socket.io';

import { resolveSessionUser } from '../auth/session.js';

export type LiveFeedPluginOptions = {
  redisUrl: string;
};

/**
 * Socket.IO fan-out of worker-published live events (ADR-0015).
 *
 * - Handshake auth = the same session cookie as the REST API (same origin);
 *   an unauthenticated handshake is refused outright.
 * - Rooms: one per workspace membership, joined at connect time. Fresh
 *   memberships apply on the next connect — acceptable for a UI hint stream.
 * - Dedicated subscriber connection: ioredis in subscriber mode can issue no
 *   other commands, so it can never be shared with BullMQ.
 * - Best-effort by contract: no replay, no ordering guarantee; clients
 *   refetch via REST on every event they care about.
 */
export const liveFeedPlugin: FastifyPluginAsync<LiveFeedPluginOptions> = async (app, opts) => {
  const io = new Server(app.server, { serveClient: false });

  io.use((socket, next) => {
    void (async () => {
      const user = await resolveSessionUser(app.db, socket.request.headers.cookie);
      if (user === null) {
        next(new Error('unauthenticated'));
        return;
      }
      const memberships = await app.db
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, user.id));
      for (const m of memberships) {
        await socket.join(`ws:${m.workspaceId}`);
      }
      next();
    })().catch((error: unknown) => {
      next(error instanceof Error ? error : new Error('handshake failed'));
    });
  });

  const subscriber = createRedisConnection(opts.redisUrl);
  await subscriber.subscribe(LIVE_EVENTS_CHANNEL);
  subscriber.on('message', (_channel: string, raw: string) => {
    try {
      const event = JSON.parse(raw) as LiveEvent;
      io.to(`ws:${event.workspaceId}`).emit(event.type, event);
    } catch (error) {
      // A malformed message is dropped, not fatal: the stream is advisory.
      app.log.warn({ err: error }, 'malformed live event dropped');
    }
  });

  app.addHook('onClose', async () => {
    io.disconnectSockets(true);
    // Detach socket.io from the HTTP server; Fastify closes the server itself.
    await io.close();
    await subscriber.quit();
  });
};
