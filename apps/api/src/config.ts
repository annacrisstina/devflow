import { fileURLToPath } from 'node:url';

import { envSchema } from 'env-schema';

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
  ],
  properties: {
    DEVFLOW_GITHUB_WEBHOOK_SECRET: { type: 'string', minLength: 1 },
    // 32+ chars: this keys both Auth.js session cookies and the signed
    // install-state HMAC; a short secret weakens every session at once.
    DEVFLOW_AUTH_SECRET: { type: 'string', minLength: 32 },
    DEVFLOW_GITHUB_CLIENT_ID: { type: 'string', minLength: 1 },
    DEVFLOW_GITHUB_CLIENT_SECRET: { type: 'string', minLength: 1 },
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
  };
}
