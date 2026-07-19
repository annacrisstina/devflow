import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { testConfig } from './test-config.js';

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
