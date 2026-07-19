import type { Paginated, RunSummary } from '@devflow/contract/api';
import { repositories, workflowRuns } from '@devflow/db/schema/runs';
import { installations } from '@devflow/db/schema/tenancy';
import { eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { requireSession, requireWorkspaceMember } from '../../auth/guards.js';

const LIST_QUERYSTRING = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
} as const;

/**
 * Recent runs — the live feed's initial page (the socket only pushes deltas;
 * REST remains the source of truth, ADR-0015).
 */
export const runRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/workspaces/:workspaceId/runs',
    {
      preHandler: [requireSession, requireWorkspaceMember],
      schema: { querystring: LIST_QUERYSTRING },
    },
    async (request) => {
      const workspaceId = request.workspaceId!;
      const query = request.query as { limit: number; offset: number };

      const [countRows, rows] = await Promise.all([
        app.db
          .select({ total: sql<number>`count(*)::int` })
          .from(workflowRuns)
          .innerJoin(repositories, eq(workflowRuns.repositoryId, repositories.id))
          .innerJoin(
            installations,
            eq(repositories.installationId, installations.githubInstallationId),
          )
          .where(eq(installations.workspaceId, workspaceId)),
        app.db
          .select({
            id: workflowRuns.id,
            githubRunId: workflowRuns.githubRunId,
            runAttempt: workflowRuns.runAttempt,
            owner: repositories.owner,
            name: repositories.name,
            runName: workflowRuns.name,
            headBranch: workflowRuns.headBranch,
            headSha: workflowRuns.headSha,
            conclusion: workflowRuns.conclusion,
            processingStatus: workflowRuns.processingStatus,
            runStartedAt: workflowRuns.runStartedAt,
            completedAt: workflowRuns.completedAt,
            // Correlated counts are fine at page size ≤ 100; revisit only if
            // a real page proves slow (measure first, ADR-0008 discipline).
            totalTests: sql<number>`(SELECT count(*)::int FROM test_results tr WHERE tr.workflow_run_id = ${workflowRuns.id})`,
            failedTests: sql<number>`(SELECT count(*)::int FROM test_results tr WHERE tr.workflow_run_id = ${workflowRuns.id} AND tr.status IN ('failed', 'error'))`,
          })
          .from(workflowRuns)
          .innerJoin(repositories, eq(workflowRuns.repositoryId, repositories.id))
          .innerJoin(
            installations,
            eq(repositories.installationId, installations.githubInstallationId),
          )
          .where(eq(installations.workspaceId, workspaceId))
          .orderBy(sql`${workflowRuns.runStartedAt} DESC NULLS LAST`, sql`${workflowRuns.id} DESC`)
          .limit(query.limit)
          .offset(query.offset),
      ]);

      const body: Paginated<RunSummary> = {
        items: rows.map((r) => ({
          id: r.id.toString(),
          githubRunId: r.githubRunId.toString(),
          runAttempt: r.runAttempt,
          repository: `${r.owner}/${r.name}`,
          name: r.runName,
          headBranch: r.headBranch,
          headSha: r.headSha,
          conclusion: r.conclusion,
          processingStatus: r.processingStatus,
          runStartedAt: r.runStartedAt?.toISOString() ?? null,
          completedAt: r.completedAt?.toISOString() ?? null,
          totalTests: r.totalTests,
          failedTests: r.failedTests,
        })),
        limit: query.limit,
        offset: query.offset,
        total: countRows[0]?.total ?? 0,
      };
      return body;
    },
  );
};
