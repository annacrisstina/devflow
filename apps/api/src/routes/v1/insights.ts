import { clusterBySimilarity } from '@devflow/ai/clustering';
import type { Embedder } from '@devflow/ai/embedder';
import type { FailureCluster, SearchResult } from '@devflow/contract/api';
import { failureEmbeddings } from '@devflow/db/schema/ai';
import { repositories, testResults, workflowRuns } from '@devflow/db/schema/runs';
import { installations } from '@devflow/db/schema/tenancy';
import { and, cosineDistance, eq, gte, inArray, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { requireSession, requireWorkspaceMember } from '../../auth/guards.js';
import { sendError } from '../../http/errors.js';

export type InsightsRoutesOptions = {
  /** Absent when the embeddings feature is off — routes answer 501. */
  embedder: Embedder | undefined;
  clusterThreshold: number;
};

const SEARCH_QUERYSTRING = {
  type: 'object',
  required: ['q'],
  additionalProperties: false,
  properties: {
    q: { type: 'string', minLength: 2, maxLength: 500 },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
  },
} as const;

const CLUSTERS_QUERYSTRING = {
  type: 'object',
  additionalProperties: false,
  properties: {
    days: { type: 'integer', minimum: 1, maximum: 90, default: 14 },
  },
} as const;

/** Window of stored vectors clustering will consider (ADR-0018). */
const CLUSTER_VECTOR_CAP = 1000;
const AFFECTED_TESTS_CAP = 5;

/**
 * The AI layer's key-free read surface (ADR-0018): semantic search and
 * failure clusters, both computed from locally-embedded vectors. Enumerated
 * call site of @devflow/ai (ADR-0017).
 */
export const insightsRoutes: FastifyPluginAsync<InsightsRoutesOptions> = async (app, opts) => {
  /** hash -> { occurrences, tests } for a set of failure texts, one query. */
  async function affectedByHash(
    repositoryIds: bigint[],
    hashes: string[],
  ): Promise<Map<string, { occurrences: number; tests: string[] }>> {
    const result = new Map<string, { occurrences: number; tests: string[] }>();
    if (hashes.length === 0 || repositoryIds.length === 0) return result;
    const rows = await app.db
      .select({
        failureHash: testResults.failureHash,
        suiteName: testResults.suiteName,
        className: testResults.className,
        testName: testResults.testName,
        occurrences: sql<number>`count(*)::int`,
      })
      .from(testResults)
      .innerJoin(workflowRuns, eq(testResults.workflowRunId, workflowRuns.id))
      .where(
        and(
          inArray(workflowRuns.repositoryId, repositoryIds),
          inArray(testResults.failureHash, hashes),
        ),
      )
      .groupBy(
        testResults.failureHash,
        testResults.suiteName,
        testResults.className,
        testResults.testName,
      );
    for (const row of rows) {
      const hash = row.failureHash!;
      const entry = result.get(hash) ?? { occurrences: 0, tests: [] };
      entry.occurrences += row.occurrences;
      if (entry.tests.length < AFFECTED_TESTS_CAP) {
        entry.tests.push(
          [row.suiteName, row.className, row.testName].filter((p) => p !== '').join(' › '),
        );
      }
      result.set(hash, entry);
    }
    return result;
  }

  app.get(
    '/api/v1/workspaces/:workspaceId/search',
    {
      preHandler: [requireSession, requireWorkspaceMember],
      schema: { querystring: SEARCH_QUERYSTRING },
    },
    async (request, reply) => {
      if (opts.embedder === undefined) {
        return sendError(reply, 501, 'ai_disabled', 'Semantic search is disabled here.');
      }
      const workspaceId = request.workspaceId!;
      const query = request.query as { q: string; limit: number };

      const [queryVector] = await opts.embedder.embed([query.q]);
      const distance = cosineDistance(failureEmbeddings.embedding, Array.from(queryVector!));

      const rows = await app.db
        .select({
          repositoryId: repositories.id,
          owner: repositories.owner,
          name: repositories.name,
          snippet: failureEmbeddings.snippet,
          contentHash: failureEmbeddings.contentHash,
          distance: sql<number>`CAST(${distance} AS double precision)`,
        })
        .from(failureEmbeddings)
        .innerJoin(repositories, eq(failureEmbeddings.repositoryId, repositories.id))
        .innerJoin(
          installations,
          eq(repositories.installationId, installations.githubInstallationId),
        )
        .where(eq(installations.workspaceId, workspaceId))
        // Exact scan by design at MVP scale; HNSW trigger recorded (ADR-0018).
        .orderBy(distance)
        .limit(query.limit);

      const affected = await affectedByHash(
        [...new Set(rows.map((r) => r.repositoryId))],
        rows.map((r) => r.contentHash),
      );
      const items: SearchResult[] = rows.map((row) => ({
        repositoryId: row.repositoryId.toString(),
        repository: `${row.owner}/${row.name}`,
        snippet: row.snippet,
        similarity: 1 - row.distance,
        occurrences: affected.get(row.contentHash)?.occurrences ?? 0,
        affectedTests: affected.get(row.contentHash)?.tests ?? [],
      }));
      return { items };
    },
  );

  app.get(
    '/api/v1/workspaces/:workspaceId/repositories/:repositoryId/failure-clusters',
    {
      preHandler: [requireSession, requireWorkspaceMember],
      schema: { querystring: CLUSTERS_QUERYSTRING },
    },
    async (request, reply) => {
      if (opts.embedder === undefined) {
        return sendError(reply, 501, 'ai_disabled', 'Failure clustering is disabled here.');
      }
      const workspaceId = request.workspaceId!;
      const params = request.params as { repositoryId: string };
      let repositoryId: bigint;
      try {
        repositoryId = BigInt(params.repositoryId);
      } catch {
        return sendError(reply, 404, 'not_found', 'Repository not found.');
      }
      const { days } = request.query as { days: number };

      // Repo must belong to the workspace — same no-oracle rule as everywhere.
      const repoRows = await app.db
        .select({ id: repositories.id })
        .from(repositories)
        .innerJoin(
          installations,
          eq(repositories.installationId, installations.githubInstallationId),
        )
        .where(and(eq(repositories.id, repositoryId), eq(installations.workspaceId, workspaceId)))
        .limit(1);
      if (repoRows.length === 0) {
        return sendError(reply, 404, 'not_found', 'Repository not found.');
      }

      const cutoff = new Date(Date.now() - days * 86_400_000);
      const vectors = await app.db
        .select({
          contentHash: failureEmbeddings.contentHash,
          snippet: failureEmbeddings.snippet,
          embedding: failureEmbeddings.embedding,
        })
        .from(failureEmbeddings)
        .where(
          and(
            eq(failureEmbeddings.repositoryId, repositoryId),
            gte(failureEmbeddings.lastSeenAt, cutoff),
          ),
        )
        .orderBy(sql`${failureEmbeddings.lastSeenAt} DESC`)
        .limit(CLUSTER_VECTOR_CAP);

      if (vectors.length === 0) return { clusters: [] };

      const affected = await affectedByHash(
        [repositoryId],
        vectors.map((v) => v.contentHash),
      );
      const clusters = clusterBySimilarity(
        vectors.map((v) => ({
          id: v.contentHash,
          vector: Float32Array.from(v.embedding),
          weight: affected.get(v.contentHash)?.occurrences ?? 1,
        })),
        opts.clusterThreshold,
      );

      const snippetByHash = new Map(vectors.map((v) => [v.contentHash, v.snippet]));
      const body: { clusters: FailureCluster[] } = {
        clusters: clusters.map((cluster) => {
          const tests = new Set<string>();
          for (const hash of cluster.memberIds) {
            for (const test of affected.get(hash)?.tests ?? []) {
              if (tests.size < AFFECTED_TESTS_CAP) tests.add(test);
            }
          }
          return {
            representativeSnippet: snippetByHash.get(cluster.representativeId)!,
            distinctFailures: cluster.memberIds.length,
            occurrences: cluster.totalWeight,
            affectedTests: [...tests],
          };
        }),
      };
      return body;
    },
  );
};
