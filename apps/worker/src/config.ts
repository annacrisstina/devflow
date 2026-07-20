import { fileURLToPath } from 'node:url';

import { envSchema } from 'env-schema';

import type { DetectionConfig } from './detection/score.js';

export type WorkerConfig = {
  logLevel: string;
  /** Health/metrics listener (ADR-0021); loopback in dev, 0.0.0.0 in containers. */
  healthHost: string;
  healthPort: number;
  databaseUrl: string;
  redisUrl: string;
  concurrency: number;
  github: {
    appId: string;
    /** PKCS#1 or PKCS#8 PEM (decoded from base64 env). */
    privateKeyPem: string;
    /** Overridable for tests / stub servers; default is the real API. */
    apiBaseUrl: string;
  };
  /** Compressed artifact size above which the artifact is skipped. */
  maxArtifactBytes: number;
  /** Uncompressed per-XML-entry size above which the entry is skipped. */
  maxXmlEntryBytes: number;
  /** ADR-0010 knobs; defaults deliberately under-flag. */
  detection: DetectionConfig;
  /** AI layer (ADR-0017/0018): embeddings on/off, model cache, per-run cap. */
  ai: {
    embeddings: boolean;
    modelDir: string | undefined;
    embedMaxPerRun: number;
  };
};

type RawEnv = {
  DEVFLOW_LOG_LEVEL: string;
  DEVFLOW_WORKER_HOST: string;
  DEVFLOW_WORKER_PORT: number;
  DEVFLOW_DATABASE_URL: string;
  DEVFLOW_REDIS_URL: string;
  DEVFLOW_WORKER_CONCURRENCY: number;
  DEVFLOW_GITHUB_APP_ID: string;
  DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64: string;
  DEVFLOW_GITHUB_API_URL: string;
  DEVFLOW_MAX_ARTIFACT_BYTES: number;
  DEVFLOW_MAX_XML_ENTRY_BYTES: number;
  DEVFLOW_AI_EMBEDDINGS: string;
  DEVFLOW_AI_MODEL_DIR?: string;
  DEVFLOW_AI_EMBED_MAX_PER_RUN: number;
  DEVFLOW_FLAKE_HALF_LIFE_DAYS: number;
  DEVFLOW_FLAKE_SATURATION_K: number;
  DEVFLOW_FLAKE_FLAKY_THRESHOLD: number;
  DEVFLOW_FLAKE_SUSPECT_THRESHOLD: number;
};

const schema = {
  type: 'object',
  // Credentials have no defaults, ever: a worker that cannot authenticate to
  // GitHub must die at boot, not at the first job.
  required: ['DEVFLOW_GITHUB_APP_ID', 'DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64'],
  properties: {
    DEVFLOW_LOG_LEVEL: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
      default: 'info',
    },
    DEVFLOW_DATABASE_URL: {
      type: 'string',
      default: 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow',
    },
    DEVFLOW_REDIS_URL: { type: 'string', default: 'redis://127.0.0.1:6379' },
    DEVFLOW_WORKER_CONCURRENCY: { type: 'number', default: 5 },
    DEVFLOW_WORKER_HOST: { type: 'string', default: '127.0.0.1' },
    DEVFLOW_WORKER_PORT: { type: 'number', default: 3002 },
    DEVFLOW_GITHUB_APP_ID: { type: 'string', minLength: 1 },
    DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64: { type: 'string', minLength: 1 },
    DEVFLOW_GITHUB_API_URL: { type: 'string', default: 'https://api.github.com' },
    DEVFLOW_MAX_ARTIFACT_BYTES: { type: 'number', default: 104_857_600 },
    DEVFLOW_MAX_XML_ENTRY_BYTES: { type: 'number', default: 52_428_800 },
    // AI layer (ADR-0018). Embeddings default ON — they are local and free;
    // 'off' disables the stage entirely (the amputation flag).
    DEVFLOW_AI_EMBEDDINGS: { type: 'string', enum: ['on', 'off'], default: 'on' },
    DEVFLOW_AI_MODEL_DIR: { type: 'string' },
    DEVFLOW_AI_EMBED_MAX_PER_RUN: { type: 'number', default: 50, exclusiveMinimum: 0 },
    // Detection knobs (ADR-0010). Defaults are the ADR's reference values;
    // exclusiveMinimum guards the division in the scoring formula.
    DEVFLOW_FLAKE_HALF_LIFE_DAYS: { type: 'number', default: 14, exclusiveMinimum: 0 },
    DEVFLOW_FLAKE_SATURATION_K: { type: 'number', default: 2.0, exclusiveMinimum: 0 },
    DEVFLOW_FLAKE_FLAKY_THRESHOLD: {
      type: 'number',
      default: 0.5,
      exclusiveMinimum: 0,
      maximum: 1,
    },
    DEVFLOW_FLAKE_SUSPECT_THRESHOLD: {
      type: 'number',
      default: 0.25,
      exclusiveMinimum: 0,
      maximum: 1,
    },
  },
} as const;

export function loadConfig(): WorkerConfig {
  const env = envSchema<RawEnv>({
    schema,
    dotenv: { path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true },
  });
  if (env.DEVFLOW_FLAKE_SUSPECT_THRESHOLD >= env.DEVFLOW_FLAKE_FLAKY_THRESHOLD) {
    // Cross-field constraint JSON Schema can't express; a config where
    // "suspected" outranks "flaky" is a misconfiguration, not a tuning choice.
    throw new Error('DEVFLOW_FLAKE_SUSPECT_THRESHOLD must be below DEVFLOW_FLAKE_FLAKY_THRESHOLD');
  }
  return {
    logLevel: env.DEVFLOW_LOG_LEVEL,
    healthHost: env.DEVFLOW_WORKER_HOST,
    healthPort: env.DEVFLOW_WORKER_PORT,
    databaseUrl: env.DEVFLOW_DATABASE_URL,
    redisUrl: env.DEVFLOW_REDIS_URL,
    concurrency: env.DEVFLOW_WORKER_CONCURRENCY,
    github: {
      appId: env.DEVFLOW_GITHUB_APP_ID,
      privateKeyPem: Buffer.from(env.DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64, 'base64').toString(
        'utf8',
      ),
      apiBaseUrl: env.DEVFLOW_GITHUB_API_URL,
    },
    maxArtifactBytes: env.DEVFLOW_MAX_ARTIFACT_BYTES,
    maxXmlEntryBytes: env.DEVFLOW_MAX_XML_ENTRY_BYTES,
    detection: {
      halfLifeDays: env.DEVFLOW_FLAKE_HALF_LIFE_DAYS,
      saturationK: env.DEVFLOW_FLAKE_SATURATION_K,
      flakyThreshold: env.DEVFLOW_FLAKE_FLAKY_THRESHOLD,
      suspectThreshold: env.DEVFLOW_FLAKE_SUSPECT_THRESHOLD,
    },
    ai: {
      embeddings: env.DEVFLOW_AI_EMBEDDINGS === 'on',
      modelDir: env.DEVFLOW_AI_MODEL_DIR,
      embedMaxPerRun: env.DEVFLOW_AI_EMBED_MAX_PER_RUN,
    },
  };
}
