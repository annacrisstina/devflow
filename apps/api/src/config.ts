import { fileURLToPath } from 'node:url';

import { envSchema } from 'env-schema';

import type { FlakeReadConfig } from './flake/effective-score.js';

/**
 * All configuration enters through here, validated at boot: a misconfigured
 * process must die immediately with a precise error, not limp along and fail
 * on the first request.
 */
export type ApiConfig = {
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  redisUrl: string;
  webhookSecret: string;
  /** Public base URL of this deployment (OAuth callbacks, signed links). */
  appUrl: string;
  /** Auth.js cookie/token secret + HMAC key for signed install-state (ADR-0013). */
  authSecret: string;
  /** The GitHub App's own OAuth credentials (user login, ADR-0013). */
  githubClientId: string;
  githubClientSecret: string;
  /** The App's public slug — builds the install link (ADR-0012). */
  githubAppSlug: string;
  /**
   * Absolute path of the built SPA (apps/web/dist). Optional: unset in dev
   * (Vite serves the SPA) and in tests; set in self-hosted deployments so
   * the API serves the dashboard from the same origin.
   */
  webDist: string | undefined;
  /**
   * Read-model twin of the worker's detection knobs (ADR-0014): decay-at-read
   * uses the same env variables, so tuning detection tunes reads with it.
   */
  flake: FlakeReadConfig;
  /**
   * AI layer (ADR-0017): embeddings power search/clustering (local, key-free);
   * the LLM key gates hypotheses — absent key means the feature is off.
   */
  ai: {
    embeddings: boolean;
    modelDir: string | undefined;
    clusterThreshold: number;
    apiKey: string | undefined;
    model: string;
    baseUrl: string;
  };
};

type RawEnv = {
  DEVFLOW_API_HOST: string;
  DEVFLOW_API_PORT: number;
  DEVFLOW_LOG_LEVEL: string;
  DEVFLOW_DATABASE_URL: string;
  DEVFLOW_REDIS_URL: string;
  DEVFLOW_GITHUB_WEBHOOK_SECRET: string;
  DEVFLOW_APP_URL: string;
  DEVFLOW_AUTH_SECRET: string;
  DEVFLOW_GITHUB_CLIENT_ID: string;
  DEVFLOW_GITHUB_CLIENT_SECRET: string;
  DEVFLOW_GITHUB_APP_SLUG: string;
  DEVFLOW_WEB_DIST?: string;
  DEVFLOW_AI_EMBEDDINGS: string;
  DEVFLOW_AI_MODEL_DIR?: string;
  DEVFLOW_AI_CLUSTER_THRESHOLD: number;
  DEVFLOW_AI_API_KEY?: string;
  DEVFLOW_AI_MODEL: string;
  DEVFLOW_AI_BASE_URL: string;
  DEVFLOW_FLAKE_HALF_LIFE_DAYS: number;
  DEVFLOW_FLAKE_SATURATION_K: number;
  DEVFLOW_FLAKE_FLAKY_THRESHOLD: number;
  DEVFLOW_FLAKE_SUSPECT_THRESHOLD: number;
};

const schema = {
  type: 'object',
  // No defaults for secrets, ever: a guessable default would turn
  // authentication into theater. Boot fails loudly without them.
  required: [
    'DEVFLOW_GITHUB_WEBHOOK_SECRET',
    'DEVFLOW_AUTH_SECRET',
    'DEVFLOW_GITHUB_CLIENT_ID',
    'DEVFLOW_GITHUB_CLIENT_SECRET',
    'DEVFLOW_GITHUB_APP_SLUG',
  ],
  properties: {
    DEVFLOW_GITHUB_WEBHOOK_SECRET: { type: 'string', minLength: 1 },
    // 32+ chars: this keys both Auth.js session cookies and the signed
    // install-state HMAC; a short secret weakens every session at once.
    DEVFLOW_AUTH_SECRET: { type: 'string', minLength: 32 },
    DEVFLOW_GITHUB_CLIENT_ID: { type: 'string', minLength: 1 },
    DEVFLOW_GITHUB_CLIENT_SECRET: { type: 'string', minLength: 1 },
    DEVFLOW_GITHUB_APP_SLUG: { type: 'string', minLength: 1 },
    DEVFLOW_WEB_DIST: { type: 'string' },
    // Loopback default matches the dev API address; a deployment behind a
    // domain must set this or OAuth callbacks will point at localhost.
    DEVFLOW_APP_URL: { type: 'string', default: 'http://127.0.0.1:3001' },
    // Loopback by default: exposing the dev API to the network must be an
    // explicit choice (compose-based self-hosting overrides this in M6).
    DEVFLOW_API_HOST: { type: 'string', default: '127.0.0.1' },
    DEVFLOW_API_PORT: { type: 'number', default: 3001 },
    DEVFLOW_LOG_LEVEL: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
      default: 'info',
    },
    // Default matches compose.yaml so a fresh dev machine works out of the box.
    DEVFLOW_DATABASE_URL: {
      type: 'string',
      default: 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow',
    },
    DEVFLOW_REDIS_URL: { type: 'string', default: 'redis://127.0.0.1:6379' },
    // AI layer (ADR-0017/0018/0019). Embeddings are local and default on;
    // the LLM has no default key, ever — no key, no LLM.
    DEVFLOW_AI_EMBEDDINGS: { type: 'string', enum: ['on', 'off'], default: 'on' },
    DEVFLOW_AI_MODEL_DIR: { type: 'string' },
    DEVFLOW_AI_CLUSTER_THRESHOLD: {
      type: 'number',
      default: 0.8,
      exclusiveMinimum: 0,
      maximum: 1,
    },
    DEVFLOW_AI_API_KEY: { type: 'string' },
    DEVFLOW_AI_MODEL: { type: 'string', default: 'claude-haiku-4-5' },
    DEVFLOW_AI_BASE_URL: { type: 'string', default: 'https://api.anthropic.com' },
    // Mirror of the worker's detection knobs (ADR-0010 reference defaults);
    // exclusiveMinimum guards the divisions in the decay arithmetic.
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

export function loadConfig(): ApiConfig {
  const env = envSchema<RawEnv>({
    schema,
    // Repo-root .env (gitignored); silently absent in CI and production,
    // where real environment variables are the only source. quiet: stdout
    // must carry structured logs only, not dotenv's banner.
    dotenv: { path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true },
  });
  // Cross-field constraint JSON Schema can't express (same check as the
  // worker): the verdict bands must not invert.
  if (env.DEVFLOW_FLAKE_SUSPECT_THRESHOLD >= env.DEVFLOW_FLAKE_FLAKY_THRESHOLD) {
    throw new Error(
      'DEVFLOW_FLAKE_SUSPECT_THRESHOLD must be strictly below DEVFLOW_FLAKE_FLAKY_THRESHOLD',
    );
  }

  return {
    host: env.DEVFLOW_API_HOST,
    port: env.DEVFLOW_API_PORT,
    logLevel: env.DEVFLOW_LOG_LEVEL,
    databaseUrl: env.DEVFLOW_DATABASE_URL,
    redisUrl: env.DEVFLOW_REDIS_URL,
    webhookSecret: env.DEVFLOW_GITHUB_WEBHOOK_SECRET,
    appUrl: env.DEVFLOW_APP_URL.replace(/\/$/, ''),
    authSecret: env.DEVFLOW_AUTH_SECRET,
    githubClientId: env.DEVFLOW_GITHUB_CLIENT_ID,
    githubClientSecret: env.DEVFLOW_GITHUB_CLIENT_SECRET,
    githubAppSlug: env.DEVFLOW_GITHUB_APP_SLUG,
    webDist: env.DEVFLOW_WEB_DIST,
    ai: {
      embeddings: env.DEVFLOW_AI_EMBEDDINGS === 'on',
      modelDir: env.DEVFLOW_AI_MODEL_DIR,
      clusterThreshold: env.DEVFLOW_AI_CLUSTER_THRESHOLD,
      apiKey: env.DEVFLOW_AI_API_KEY,
      model: env.DEVFLOW_AI_MODEL,
      baseUrl: env.DEVFLOW_AI_BASE_URL.replace(/\/$/, ''),
    },
    flake: {
      halfLifeDays: env.DEVFLOW_FLAKE_HALF_LIFE_DAYS,
      saturationK: env.DEVFLOW_FLAKE_SATURATION_K,
      flakyThreshold: env.DEVFLOW_FLAKE_FLAKY_THRESHOLD,
      suspectThreshold: env.DEVFLOW_FLAKE_SUSPECT_THRESHOLD,
    },
  };
}
