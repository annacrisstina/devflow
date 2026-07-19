import { createDbClient } from '@devflow/db/client';
import { createRedisConnection } from '@devflow/queue/connection';
import { pino } from 'pino';

import { createEmbedder } from '@devflow/ai/embedder';
import { createIngestQueue } from '@devflow/queue/ingest';

import { createEmbeddingStage } from './ai/embedding-stage.js';
import { createAnnotationStage } from './annotation/annotation-stage.js';
import { createHealthServer } from './health-server.js';
import { queueDepth } from './metrics.js';
import { loadConfig } from './config.js';
import { createDetectionStage } from './detection/detection-stage.js';
import { createGitHubClient } from './github/client.js';
import { createLivePublisher } from './live/publisher.js';
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
const detectionStage = createDetectionStage({ db: dbClient.db, detection: config.detection });
const annotationStage = createAnnotationStage({ db: dbClient.db, github });
// Own connection for PUBLISH: BullMQ manages the worker connection's state
// and a shared connection would couple live-feed traffic to job consumption.
const publishConnection = createRedisConnection(config.redisUrl);
const live = createLivePublisher(dbClient.db, publishConnection);
// The AI layer's enumerated worker seam (ADR-0017); absent entirely when off.
const embeddingStage = config.ai.embeddings
  ? createEmbeddingStage({
      db: dbClient.db,
      embedder: createEmbedder({ modelDir: config.ai.modelDir }),
      maxNewPerRun: config.ai.embedMaxPerRun,
    })
  : undefined;

const worker = createIngestWorker(
  { db: dbClient.db, log, artifactStage, detectionStage, annotationStage, live, embeddingStage },
  connection,
  config.concurrency,
  log,
);

// Operational surface (ADR-0021): compose healthchecks poll /healthz;
// Prometheus scrapes /metrics. Queue-depth gauges refresh on an interval —
// the DLQ (failed state) is the number worth alerting on.
const healthServer = createHealthServer({
  db: dbClient.db,
  redis: publishConnection,
  host: config.healthHost,
  port: config.healthPort,
  log,
});
await healthServer.listen();
const depthQueue = createIngestQueue(publishConnection);
const depthPoll = setInterval(() => {
  depthQueue
    .getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed')
    .then((counts) => {
      for (const [state, count] of Object.entries(counts)) {
        queueDepth.set({ state }, count);
      }
    })
    .catch((error: unknown) => log.warn({ err: error }, 'queue depth poll failed'));
}, 15_000);
depthPoll.unref();

log.info({ concurrency: config.concurrency }, 'ingest worker started');

// Graceful shutdown: stop taking jobs, finish in-flight ones, then close
// connections. `once` so a second signal kills the process outright.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'shutting down');
    clearInterval(depthPoll);
    worker
      .close()
      .then(() => healthServer.close())
      .then(() => depthQueue.close())
      .then(() => connection.quit())
      .then(() => publishConnection.quit())
      .then(() => dbClient.close())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        log.error({ err: error }, 'shutdown failed');
        process.exit(1);
      });
  });
}
