import type { Db } from '@devflow/db/client';
import { testResults, workflowRuns } from '@devflow/db/schema/runs';
import { eq } from 'drizzle-orm';

import type { JUnitCase } from '../junit/parse-junit.js';

const BATCH_SIZE = 500;

/**
 * Replace-per-run (ADR-0008): one transaction deletes the run-attempt's rows
 * and reinserts the parsed set. Convergent under retries and redeliveries;
 * no unique constraint needed (parameterized tests repeat identities).
 */
export async function persistResults(
  db: Db,
  workflowRunId: bigint,
  cases: JUnitCase[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(testResults).where(eq(testResults.workflowRunId, workflowRunId));
    for (let i = 0; i < cases.length; i += BATCH_SIZE) {
      const batch = cases.slice(i, i + BATCH_SIZE);
      await tx.insert(testResults).values(
        batch.map((c) => ({
          workflowRunId,
          suiteName: c.suiteName,
          className: c.className,
          testName: c.testName,
          status: c.status,
          durationMs: c.durationMs,
          failureMessage: c.failureMessage,
          failureDetails: c.failureDetails,
          file: c.file,
        })),
      );
    }
    await tx
      .update(workflowRuns)
      .set({ processingStatus: 'succeeded', processedAt: new Date() })
      .where(eq(workflowRuns.id, workflowRunId));
  });
}
