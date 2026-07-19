import { workspaceMembers, workspaces } from '@devflow/db/schema/tenancy';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { requireSession } from '../../auth/guards.js';

/**
 * Who am I, and which workspaces can I see — the SPA's boot query.
 */
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/me', { preHandler: [requireSession] }, async (request) => {
    // Guaranteed by requireSession.
    const user = request.sessionUser!;

    const memberships = await app.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, user.id));

    return {
      user: { id: user.id, name: user.name, email: user.email, image: user.image },
      workspaces: memberships.map((m) => ({
        id: m.id.toString(),
        name: m.name,
        role: m.role,
      })),
    };
  });
};
