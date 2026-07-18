import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Db } from '@devflow/db/client';
import { runArtifacts, workflowRuns } from '@devflow/db/schema/runs';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';

import type { GitHubClient } from '../github/client.js';
import type { JUnitCase } from '../junit/parse-junit.js';
import type { NormalizedRun } from './normalize-run.js';
import { scanZipForJUnit } from './extract-zip.js';
import { persistResults } from './persist-results.js';

export type ArtifactStageConfig = {
  db: Db;
  github: GitHubClient;
  maxArtifactBytes: number;
  maxXmlEntryBytes: number;
};

/**
 * Fetch → scan → persist for one normalized run. Every artifact considered
 * leaves a run_artifacts row (found/skipped and why): "no results" must be
 * explainable from a table (ADR-0008).
 */
export function createArtifactStage(config: ArtifactStageConfig) {
  return async function artifactStage(run: NormalizedRun, log: Logger): Promise<void> {
    const artifacts = await config.github.listRunArtifacts(
      run.installationId,
      run.owner,
      run.repo,
      run.githubRunId,
    );

    if (artifacts.length === 0) {
      await config.db
        .update(workflowRuns)
        .set({ processingStatus: 'no_artifacts', processedAt: new Date() })
        .where(eq(workflowRuns.id, run.workflowRunId));
      log.info('run has no artifacts');
      return;
    }

    const allCases: JUnitCase[] = [];
    const tempDir = await mkdtemp(join(tmpdir(), 'devflow-artifact-'));
    try {
      for (const artifact of artifacts) {
        let xmlFilesFound = 0;
        let skippedReason: string | null = null;

        if (artifact.expired) {
          skippedReason = 'expired';
        } else if (artifact.sizeInBytes > config.maxArtifactBytes) {
          skippedReason = `too_large (${artifact.sizeInBytes} bytes)`;
        } else {
          const zipPath = join(tempDir, `${artifact.id}.zip`);
          await config.github.downloadArtifactToFile(
            run.installationId,
            run.owner,
            run.repo,
            artifact.id,
            zipPath,
          );
          const scan = await scanZipForJUnit(zipPath, config.maxXmlEntryBytes);
          xmlFilesFound = scan.junitFiles;
          allCases.push(...scan.cases);
          if (scan.skippedFiles > 0) skippedReason = `skipped_xml_files:${scan.skippedFiles}`;
          log.info(
            {
              artifactId: artifact.id,
              artifactName: artifact.name,
              junitFiles: scan.junitFiles,
              cases: scan.cases.length,
            },
            'artifact scanned',
          );
        }

        const artifactRow = {
          workflowRunId: run.workflowRunId,
          githubArtifactId: BigInt(artifact.id),
          name: artifact.name,
          sizeBytes: BigInt(artifact.sizeInBytes),
          xmlFilesFound,
          skippedReason,
          processedAt: new Date(),
        };
        await config.db
          .insert(runArtifacts)
          .values(artifactRow)
          .onConflictDoUpdate({ target: runArtifacts.githubArtifactId, set: artifactRow });
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    await persistResults(config.db, run.workflowRunId, allCases);
    log.info({ results: allCases.length }, 'test results persisted');
  };
}
