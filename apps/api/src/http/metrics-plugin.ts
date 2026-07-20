import type { FastifyInstance } from 'fastify';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

/**
 * API metrics (ADR-0021). Per-instance registry (tests build many apps in
 * one process; a module-level registry would collide on registration).
 * Everything here observes existing behavior via hooks — no route changes.
 *
 * Deliberately NOT a Fastify plugin: encapsulation would scope the
 * onResponse hook to this file's own context only; called directly on the
 * root instance so every route is observed.
 *
 * /metrics is served on the main port unauthenticated: standard scrape
 * ergonomics, documented in the self-hosting guide as "allow only your
 * monitoring network at the proxy" (accepted MVP posture, ADR-0021).
 */
export function registerMetrics(app: FastifyInstance): void {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const httpDuration = new Histogram({
    name: 'devflow_http_request_duration_seconds',
    help: 'API request duration by route/method/status.',
    labelNames: ['route', 'method', 'status'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  const webhookDeliveries = new Counter({
    name: 'devflow_webhook_deliveries_total',
    help: 'GitHub webhook deliveries by outcome (ADR-0005 status contract).',
    labelNames: ['outcome'] as const,
    registers: [registry],
  });

  const WEBHOOK_OUTCOMES: Record<number, string> = {
    202: 'accepted',
    200: 'duplicate',
    401: 'rejected_signature',
    400: 'invalid',
  };

  app.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions.url ?? 'unmatched';
    // Skip self-observation: scrapes shouldn't dominate the histogram.
    if (route !== '/metrics') {
      httpDuration.observe(
        { route, method: request.method, status: String(reply.statusCode) },
        reply.elapsedTime / 1000,
      );
      if (route === '/webhooks/github') {
        webhookDeliveries.inc({
          outcome:
            WEBHOOK_OUTCOMES[reply.statusCode] ?? (reply.statusCode >= 500 ? 'error' : 'other'),
        });
      }
    }
    done();
  });

  app.get('/metrics', async (_request, reply) => {
    return reply.type(registry.contentType).send(await registry.metrics());
  });
}
