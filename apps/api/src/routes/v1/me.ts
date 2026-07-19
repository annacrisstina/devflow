import type { MeResponse, WorkspaceSummary } from '@devflow/contract/api';
import { workspaceMembers, workspaces } from '@devflow/db/schema/tenancy';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { requireSession } from '../../auth/guards.js';

export type MeRoutesOptions = {
  /** Deployment capabilities (ADR-0017) — the SPA renders only what's on. */
  features: MeResponse['features'];
};

/**
 * Who am I, and which workspaces can I see — the SPA's boot query.
 */
export const meRoutes: FastifyPluginAsync<MeRoutesOptions> = async (app, opts) => {
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

    const body: MeResponse = {
      user: { id: user.id, name: user.name, email: user.email, image: user.image },
      workspaces: memberships.map((m) => ({
        id: m.id.toString(),
        name: m.name,
        role: m.role as WorkspaceSummary['role'],
      })),
      features: opts.features,
    };
    return body;
  });
};
