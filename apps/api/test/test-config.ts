import type { ApiConfig } from '../src/config.js';

const DATABASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';

/**
 * One place for test ApiConfig so new required config fields touch one file.
 * Auth values are dummies: tests never complete a real OAuth dance (sessions
 * are inserted directly); the secret only needs to satisfy boot validation.
 */
export function testConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    databaseUrl: DATABASE_URL,
    redisUrl: process.env.DEVFLOW_REDIS_URL ?? 'redis://127.0.0.1:6379',
    webhookSecret: 'test-webhook-secret',
    appUrl: 'http://127.0.0.1:3001',
    authSecret: 'test-auth-secret-test-auth-secret!!',
    githubClientId: 'test-client-id',
    githubClientSecret: 'test-client-secret',
    // ADR-0010 reference values, same as production defaults.
    flake: { halfLifeDays: 14, saturationK: 2.0, flakyThreshold: 0.5, suspectThreshold: 0.25 },
    ...overrides,
  };
}
