import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

/**
 * Worker metrics (ADR-0021): a curated set over code paths that already log
 * — instrumentation, never new behavior. One module-level registry: the
 * worker is a single process, and stages increment these directly.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const jobsProcessed = new Counter({
  name: 'devflow_worker_jobs_total',
  help: 'Jobs finished by the ingest worker, by result.',
  labelNames: ['result'] as const,
  registers: [registry],
});

export const jobDuration = new Histogram({
  name: 'devflow_worker_job_duration_seconds',
  help: 'Wall-clock processing time per completed job.',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [registry],
});

export const queueDepth = new Gauge({
  name: 'devflow_queue_jobs',
  help: 'Jobs in the ingest queue by state (failed = the DLQ, ADR-0007).',
  labelNames: ['state'] as const,
  registers: [registry],
});

export const embeddingsCreated = new Counter({
  name: 'devflow_embeddings_created_total',
  help: 'Distinct failure texts embedded (ADR-0018).',
  registers: [registry],
});

export const checkRunsWritten = new Counter({
  name: 'devflow_check_runs_written_total',
  help: 'Advisory check runs POSTed or PATCHed (ADR-0011).',
  labelNames: ['action'] as const,
  registers: [registry],
});

export const liveEventsPublished = new Counter({
  name: 'devflow_live_events_published_total',
  help: 'Live-feed events published to Redis (ADR-0015).',
  labelNames: ['type'] as const,
  registers: [registry],
});
