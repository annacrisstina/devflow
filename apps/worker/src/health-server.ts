import http from 'node:http';

import type { Db } from '@devflow/db/client';
import type { RedisConnection } from '@devflow/queue/connection';
import { sql } from 'drizzle-orm';
import type { Logger } from 'pino';

import { registry } from './metrics.js';

/**
 * The worker's operational surface (ADR-0021, closing the ADR-0009 debt):
 * `GET /healthz` (database + Redis reachability — what compose healthchecks
 * poll) and `GET /metrics` (Prometheus text). Plain node:http on purpose —
 * the worker has no HTTP framework and two fixed routes don't justify one.
 */
export type HealthServerConfig = {
  db: Db;
  redis: RedisConnection;
  host: string;
  port: number;
  log: Logger;
};

export type HealthServer = {
  listen: () => Promise<void>;
  close: () => Promise<void>;
};

export function createHealthServer(config: HealthServerConfig): HealthServer {
  const server = http.createServer((request, response) => {
    void (async () => {
      if (request.method === 'GET' && request.url === '/healthz') {
        try {
          await config.db.execute(sql`SELECT 1`);
          const pong = await config.redis.ping();
          if (pong !== 'PONG') throw new Error(`redis answered ${pong}`);
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ status: 'ok' }));
        } catch (error) {
          config.log.warn({ err: error }, 'healthz check failed');
          response.writeHead(503, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ status: 'unavailable' }));
        }
        return;
      }
      if (request.method === 'GET' && request.url === '/metrics') {
        const body = await registry.metrics();
        response.writeHead(200, { 'content-type': registry.contentType });
        response.end(body);
        return;
      }
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    })().catch((error: unknown) => {
      config.log.error({ err: error }, 'health server request failed');
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });

  return {
    listen: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          server.removeListener('error', reject);
          config.log.info({ host: config.host, port: config.port }, 'health server listening');
          resolve();
        });
      }),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
