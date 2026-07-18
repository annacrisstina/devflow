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
};

type RawEnv = {
  DEVFLOW_API_HOST: string;
  DEVFLOW_API_PORT: number;
  DEVFLOW_LOG_LEVEL: string;
  DEVFLOW_DATABASE_URL: string;
};

const schema = {
  type: 'object',
  properties: {
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
  };
}
