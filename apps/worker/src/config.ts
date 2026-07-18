import { fileURLToPath } from 'node:url';

import { envSchema } from 'env-schema';

import type { DetectionConfig } from './detection/score.js';

export type WorkerConfig = {
  logLevel: string;
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
};

type RawEnv = {
  DEVFLOW_LOG_LEVEL: string;
  DEVFLOW_DATABASE_URL: string;
  DEVFLOW_REDIS_URL: string;
  DEVFLOW_WORKER_CONCURRENCY: number;
  DEVFLOW_GITHUB_APP_ID: string;
  DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64: string;
  DEVFLOW_GITHUB_API_URL: string;
  DEVFLOW_MAX_ARTIFACT_BYTES: number;
  DEVFLOW_MAX_XML_ENTRY_BYTES: number;
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
    DEVFLOW_GITHUB_APP_ID: { type: 'string', minLength: 1 },
    DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64: { type: 'string', minLength: 1 },
    DEVFLOW_GITHUB_API_URL: { type: 'string', default: 'https://api.github.com' },
    DEVFLOW_MAX_ARTIFACT_BYTES: { type: 'number', default: 104_857_600 },
    DEVFLOW_MAX_XML_ENTRY_BYTES: { type: 'number', default: 52_428_800 },
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
  };
}
