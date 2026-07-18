import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import type { ApiConfig } from '../src/config.js';

const DATABASE_URL =
  process.env.DEVFLOW_DATABASE_URL ?? 'postgresql://devflow:devflow_local@127.0.0.1:5432/devflow';

function testConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    databaseUrl: DATABASE_URL,
    redisUrl: process.env.DEVFLOW_REDIS_URL ?? 'redis://127.0.0.1:6379',
    webhookSecret: 'test-webhook-secret',
    ...overrides,
  };
}

describe('GET /healthz', () => {
  describe('with a reachable database', () => {
    let app: Awaited<ReturnType<typeof buildApp>>;

    beforeAll(async () => {
      app = await buildApp(testConfig());
    });

    afterAll(async () => {
      await app.close();
    });

    it('reports ok', async () => {
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });
  });

  describe('with an unreachable database', () => {
    it('reports 503', async () => {
      // Nothing listens on this loopback port, so the pool fails fast.
      const app = await buildApp(
        testConfig({ databaseUrl: 'postgresql://devflow:devflow_local@127.0.0.1:59999/devflow' }),
      );
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'unavailable' });
      await app.close();
    });
  });
});
