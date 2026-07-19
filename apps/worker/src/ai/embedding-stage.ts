import type { Embedder } from '@devflow/ai/embedder';
import { failureHash, failureText } from '@devflow/ai/failure-text';
import type { Db } from '@devflow/db/client';
import { failureEmbeddings } from '@devflow/db/schema/ai';
import { testResults } from '@devflow/db/schema/runs';
import { and, eq, inArray } from 'drizzle-orm';
import type { Logger } from 'pino';

import { embeddingsCreated } from '../metrics.js';
import type { NormalizedRun } from '../pipeline/normalize-run.js';

export type EmbeddingStageConfig = {
  db: Db;
  embedder: Embedder;
  /** New texts embedded per run; overflow recurs on later runs (ADR-0018). */
  maxNewPerRun: number;
};

export type EmbeddingStage = (run: NormalizedRun, log: Logger) => Promise<void>;

/**
 * The AI layer's one background computation (ADR-0017/0018): stamp this
 * run's failed results with their content hash and embed any failure text
 * this repository hasn't seen before. Convergent under replace-per-run
 * reprocessing (hashes recompute identically; upserts touch last_seen only).
 *
 * Failure-isolated by contract: any error here logs and returns — it can
 * never fail or retry the ingestion job (same rule as the live feed).
 */
export function createEmbeddingStage(config: EmbeddingStageConfig): EmbeddingStage {
  return async function embeddingStage(run: NormalizedRun, log: Logger): Promise<void> {
    try {
      const failed = await config.db
        .select({
          id: testResults.id,
          failureMessage: testResults.failureMessage,
          failureDetails: testResults.failureDetails,
        })
        .from(testResults)
        .where(
          and(
            eq(testResults.workflowRunId, run.workflowRunId),
            inArray(testResults.status, ['failed', 'error']),
          ),
        );
      if (failed.length === 0) return;

      const byHash = new Map<string, { text: string; rowIds: bigint[] }>();
      for (const row of failed) {
        const text = failureText(row.failureMessage, row.failureDetails);
        if (text === null) continue;
        const hash = failureHash(text);
        const entry = byHash.get(hash);
        if (entry === undefined) byHash.set(hash, { text, rowIds: [row.id] });
        else entry.rowIds.push(row.id);
      }
      if (byHash.size === 0) return;

      for (const [hash, entry] of byHash) {
        await config.db
          .update(testResults)
          .set({ failureHash: hash })
          .where(inArray(testResults.id, entry.rowIds));
      }

      const hashes = [...byHash.keys()];
      const known = await config.db
        .select({ contentHash: failureEmbeddings.contentHash })
        .from(failureEmbeddings)
        .where(
          and(
            eq(failureEmbeddings.repositoryId, run.repositoryId),
            inArray(failureEmbeddings.contentHash, hashes),
          ),
        );
      const knownSet = new Set(known.map((k) => k.contentHash));

      const fresh = hashes.filter((h) => !knownSet.has(h));
      const toEmbed = fresh.slice(0, config.maxNewPerRun);
      if (fresh.length > toEmbed.length) {
        // Overflow is stated, not silent; recurring texts get embedded later.
        log.warn(
          { newTexts: fresh.length, embedded: toEmbed.length },
          'embedding cap reached for this run',
        );
      }

      if (knownSet.size > 0) {
        await config.db
          .update(failureEmbeddings)
          .set({ lastSeenAt: new Date() })
          .where(
            and(
              eq(failureEmbeddings.repositoryId, run.repositoryId),
              inArray(failureEmbeddings.contentHash, [...knownSet]),
            ),
          );
      }

      if (toEmbed.length > 0) {
        const vectors = await config.embedder.embed(toEmbed.map((h) => byHash.get(h)!.text));
        await config.db
          .insert(failureEmbeddings)
          .values(
            toEmbed.map((hash, i) => ({
              repositoryId: run.repositoryId,
              contentHash: hash,
              snippet: byHash.get(hash)!.text,
              embedding: Array.from(vectors[i]!),
            })),
          )
          .onConflictDoUpdate({
            target: [failureEmbeddings.repositoryId, failureEmbeddings.contentHash],
            set: { lastSeenAt: new Date() },
          });
        embeddingsCreated.inc(toEmbed.length);
      }

      log.info(
        { distinctFailures: byHash.size, embedded: toEmbed.length, known: knownSet.size },
        'failure embeddings updated',
      );
    } catch (error) {
      log.warn({ err: error }, 'embedding stage failed (ignored)');
    }
  };
}
