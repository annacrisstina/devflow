import type {
  FlakyTestDetail,
  FlakyTestSummary,
  Paginated,
  TestOutcomeEntry,
} from '@devflow/contract/api';
import { testFlakeScores } from '@devflow/db/schema/flake-scores';
import { repositories, testResults, workflowRuns } from '@devflow/db/schema/runs';
import { installations } from '@devflow/db/schema/tenancy';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { requireSession, requireWorkspaceMember } from '../../auth/guards.js';
import { effectiveScoreSql, type FlakeReadConfig } from '../../flake/effective-score.js';
import { sendError } from '../../http/errors.js';

export type FlakyTestRoutesOptions = {
  flake: FlakeReadConfig;
};

const LIST_QUERYSTRING = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['flaky', 'suspected', 'healthy'] },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
} as const;

const HISTORY_LIMIT = 50;

/**
 * The flakiest-tests ranking — the dashboard's core view. Scores decay at
 * read time (ADR-0014): ordering, verdict filtering and pagination all
 * happen in SQL on the decayed value, so a page is consistent with itself.
 */
export const flakyTestRoutes: FastifyPluginAsync<FlakyTestRoutesOptions> = async (app, opts) => {
  /** WHERE band for an effective-verdict filter, in the same decayed terms. */
  function verdictBand(effective: SQL, verdict: string): SQL {
    if (verdict === 'flaky') return sql`${effective} >= ${opts.flake.flakyThreshold}`;
    if (verdict === 'suspected')
      return sql`${effective} >= ${opts.flake.suspectThreshold} AND ${effective} < ${opts.flake.flakyThreshold}`;
    return sql`${effective} < ${opts.flake.suspectThreshold}`;
  }

  function toSummary(row: {
    id: bigint;
    repositoryId: bigint;
    owner: string;
    name: string;
    suiteName: string;
    className: string;
    testName: string;
    score: number;
    effective: number;
    divergenceEvidence: number;
    transitionEvidence: number;
    lastFailureAt: Date | null;
    computedAt: Date;
  }): FlakyTestSummary {
    const effective = Number(row.effective);
    return {
      id: row.id.toString(),
      repositoryId: row.repositoryId.toString(),
      repository: `${row.owner}/${row.name}`,
      suiteName: row.suiteName,
      className: row.className,
      testName: row.testName,
      storedScore: row.score,
      effectiveScore: effective,
      verdict:
        effective >= opts.flake.flakyThreshold
          ? 'flaky'
          : effective >= opts.flake.suspectThreshold
            ? 'suspected'
            : 'healthy',
      divergenceEvidence: row.divergenceEvidence,
      transitionEvidence: row.transitionEvidence,
      lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
      computedAt: row.computedAt.toISOString(),
    };
  }

  app.get(
    '/api/v1/workspaces/:workspaceId/flaky-tests',
    {
      preHandler: [requireSession, requireWorkspaceMember],
      schema: { querystring: LIST_QUERYSTRING },
    },
    async (request) => {
      const workspaceId = request.workspaceId!;
      const query = request.query as { verdict?: string; limit: number; offset: number };
      const effective = effectiveScoreSql(
        opts.flake,
        new Date(),
        testFlakeScores.score,
        testFlakeScores.computedAt,
      );

      const scope = and(
        eq(installations.workspaceId, workspaceId),
        query.verdict === undefined ? undefined : verdictBand(effective, query.verdict),
      );

      const [countRows, rows] = await Promise.all([
        app.db
          .select({ total: sql<number>`count(*)::int` })
          .from(testFlakeScores)
          .innerJoin(repositories, eq(testFlakeScores.repositoryId, repositories.id))
          .innerJoin(
            installations,
            eq(repositories.installationId, installations.githubInstallationId),
          )
          .where(scope),
        app.db
          .select({
            id: testFlakeScores.id,
            repositoryId: repositories.id,
            owner: repositories.owner,
            name: repositories.name,
            suiteName: testFlakeScores.suiteName,
            className: testFlakeScores.className,
            testName: testFlakeScores.testName,
            score: testFlakeScores.score,
            effective: effective.as('effective_score'),
            divergenceEvidence: testFlakeScores.divergenceEvidence,
            transitionEvidence: testFlakeScores.transitionEvidence,
            lastFailureAt: testFlakeScores.lastFailureAt,
            computedAt: testFlakeScores.computedAt,
          })
          .from(testFlakeScores)
          .innerJoin(repositories, eq(testFlakeScores.repositoryId, repositories.id))
          .innerJoin(
            installations,
            eq(repositories.installationId, installations.githubInstallationId),
          )
          .where(scope)
          .orderBy(desc(sql`effective_score`), desc(testFlakeScores.id))
          .limit(query.limit)
          .offset(query.offset),
      ]);

      const body: Paginated<FlakyTestSummary> = {
        items: rows.map(toSummary),
        limit: query.limit,
        offset: query.offset,
        total: countRows[0]?.total ?? 0,
      };
      return body;
    },
  );

  app.get(
    '/api/v1/workspaces/:workspaceId/flaky-tests/:scoreId',
    { preHandler: [requireSession, requireWorkspaceMember] },
    async (request, reply) => {
      const workspaceId = request.workspaceId!;
      const params = request.params as { scoreId: string };
      let scoreId: bigint;
      try {
        scoreId = BigInt(params.scoreId);
      } catch {
        return sendError(reply, 404, 'not_found', 'Flaky test not found.');
      }

      const effective = effectiveScoreSql(
        opts.flake,
        new Date(),
        testFlakeScores.score,
        testFlakeScores.computedAt,
      );
      const rows = await app.db
        .select({
          id: testFlakeScores.id,
          repositoryId: repositories.id,
          owner: repositories.owner,
          name: repositories.name,
          suiteName: testFlakeScores.suiteName,
          className: testFlakeScores.className,
          testName: testFlakeScores.testName,
          score: testFlakeScores.score,
          effective: effective.as('effective_score'),
          divergenceEvidence: testFlakeScores.divergenceEvidence,
          transitionEvidence: testFlakeScores.transitionEvidence,
          lastFailureAt: testFlakeScores.lastFailureAt,
          computedAt: testFlakeScores.computedAt,
        })
        .from(testFlakeScores)
        .innerJoin(repositories, eq(testFlakeScores.repositoryId, repositories.id))
        .innerJoin(
          installations,
          eq(repositories.installationId, installations.githubInstallationId),
        )
        // Workspace scope in the WHERE, not after: a foreign scoreId must be
        // indistinguishable from a missing one (404 either way).
        .where(and(eq(testFlakeScores.id, scoreId), eq(installations.workspaceId, workspaceId)))
        .limit(1);
      const row = rows[0];
      if (row === undefined) {
        return sendError(reply, 404, 'not_found', 'Flaky test not found.');
      }

      const history = await app.db
        .select({
          workflowRunId: workflowRuns.id,
          githubRunId: workflowRuns.githubRunId,
          runAttempt: workflowRuns.runAttempt,
          headBranch: workflowRuns.headBranch,
          headSha: workflowRuns.headSha,
          status: testResults.status,
          runStartedAt: workflowRuns.runStartedAt,
          durationMs: testResults.durationMs,
          failureMessage: testResults.failureMessage,
        })
        .from(testResults)
        .innerJoin(workflowRuns, eq(testResults.workflowRunId, workflowRuns.id))
        .where(
          and(
            eq(workflowRuns.repositoryId, row.repositoryId),
            eq(testResults.suiteName, row.suiteName),
            eq(testResults.className, row.className),
            eq(testResults.testName, row.testName),
          ),
        )
        .orderBy(desc(workflowRuns.runStartedAt), desc(workflowRuns.runAttempt))
        .limit(HISTORY_LIMIT);

      const entries: TestOutcomeEntry[] = history.map((h) => ({
        workflowRunId: h.workflowRunId.toString(),
        githubRunId: h.githubRunId.toString(),
        runAttempt: h.runAttempt,
        headBranch: h.headBranch,
        headSha: h.headSha,
        status: h.status,
        runStartedAt: h.runStartedAt?.toISOString() ?? null,
        durationMs: h.durationMs,
        failureMessage: h.failureMessage,
      }));

      const body: FlakyTestDetail = { ...toSummary(row), history: entries };
      return body;
    },
  );
};
