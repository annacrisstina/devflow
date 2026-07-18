import { createDbClient } from '@devflow/db/client';
import { createRedisConnection } from '@devflow/queue/connection';
import { pino } from 'pino';

import { loadConfig } from './config.js';
import { createGitHubClient } from './github/client.js';
import { createArtifactStage } from './pipeline/artifact-stage.js';
import { createIngestWorker } from './worker.js';

const config = loadConfig();
const log = pino({ level: config.logLevel });

const dbClient = createDbClient(config.databaseUrl);
const connection = createRedisConnection(config.redisUrl);
const github = createGitHubClient({
  appId: config.github.appId,
  privateKeyPem: config.github.privateKeyPem,
  baseUrl: config.github.apiBaseUrl,
});
const artifactStage = createArtifactStage({
  db: dbClient.db,
  github,
  maxArtifactBytes: config.maxArtifactBytes,
  maxXmlEntryBytes: config.maxXmlEntryBytes,
});

const worker = createIngestWorker(
  { db: dbClient.db, log, artifactStage },
  connection,
  config.concurrency,
  log,
);

log.info({ concurrency: config.concurrency }, 'ingest worker started');

// Graceful shutdown: stop taking jobs, finish in-flight ones, then close
// connections. `once` so a second signal kills the process outright.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'shutting down');
    worker
      .close()
      .then(() => connection.quit())
      .then(() => dbClient.close())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        log.error({ err: error }, 'shutdown failed');
        process.exit(1);
      });
  });
}
