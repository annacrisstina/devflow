import type { RepositorySummary, WorkspaceDetail, WorkspaceSummary } from '@devflow/contract/api';
import { repositories } from '@devflow/db/schema/runs';
import { installations, workspaceMembers, workspaces } from '@devflow/db/schema/tenancy';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { requireSession, requireWorkspaceMember } from '../../auth/guards.js';

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/workspaces',
    {
      preHandler: [requireSession],
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: { name: { type: 'string', minLength: 1, maxLength: 100 } },
        },
      },
    },
    async (request, reply) => {
      const user = request.sessionUser!;
      const { name } = request.body as { name: string };

      // Creator becomes owner atomically: a workspace without a member would
      // be unreachable by everyone, including its creator.
      const created = await app.db.transaction(async (tx) => {
        const rows = await tx.insert(workspaces).values({ name, createdBy: user.id }).returning();
        const workspace = rows[0]!;
        await tx
          .insert(workspaceMembers)
          .values({ workspaceId: workspace.id, userId: user.id, role: 'owner' });
        return workspace;
      });

      const body: WorkspaceSummary = {
        id: created.id.toString(),
        name: created.name,
        role: 'owner',
      };
      return reply.status(201).send(body);
    },
  );

  app.get(
    '/api/v1/workspaces/:workspaceId',
    { preHandler: [requireSession, requireWorkspaceMember] },
    async (request) => {
      const workspaceId = request.workspaceId!;
      const user = request.sessionUser!;

      const rows = await app.db
        .select({ name: workspaces.name, role: workspaceMembers.role })
        .from(workspaces)
        .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
        .where(and(eq(workspaces.id, workspaceId), eq(workspaceMembers.userId, user.id)))
        .limit(1);
      const workspace = rows[0]!;

      const installed = await app.db
        .select()
        .from(installations)
        .where(eq(installations.workspaceId, workspaceId))
        .orderBy(asc(installations.firstSeenAt));

      const body: WorkspaceDetail = {
        id: workspaceId.toString(),
        name: workspace.name,
        role: workspace.role as WorkspaceDetail['role'],
        installations: installed.map((i) => ({
          id: i.id.toString(),
          githubInstallationId: i.githubInstallationId.toString(),
          accountLogin: i.accountLogin,
          accountType: i.accountType,
          uninstalledAt: i.uninstalledAt?.toISOString() ?? null,
        })),
      };
      return body;
    },
  );

  app.get(
    '/api/v1/workspaces/:workspaceId/repositories',
    { preHandler: [requireSession, requireWorkspaceMember] },
    async (request) => {
      const workspaceId = request.workspaceId!;

      // Tenancy chain (ADR-0012): repository → installation → workspace.
      const rows = await app.db
        .select({
          id: repositories.id,
          owner: repositories.owner,
          name: repositories.name,
          private: repositories.private,
          defaultBranch: repositories.defaultBranch,
        })
        .from(repositories)
        .innerJoin(
          installations,
          eq(repositories.installationId, installations.githubInstallationId),
        )
        .where(eq(installations.workspaceId, workspaceId))
        .orderBy(asc(repositories.owner), asc(repositories.name));

      const items: RepositorySummary[] = rows.map((r) => ({
        id: r.id.toString(),
        owner: r.owner,
        name: r.name,
        private: r.private,
        defaultBranch: r.defaultBranch,
      }));
      return { items };
    },
  );
};
