# ADR-0021: Observability — health endpoints and Prometheus metrics

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** founder + lead engineer

## Context

"The product is observability for CI, so it must be observable itself" has been the stated stance since M0 (architecture-context), carried so far by structured logs with delivery-GUID correlation. M6's containers need machine-checkable liveness (compose healthchecks), and two numbers logs cannot surface at a glance — queue depth and DLQ size — are exactly what a self-hosting operator needs on a dashboard. The worker has had no HTTP surface at all (accepted ADR-0009 debt). Constraint: instrumentation, never behavior — metrics observe code paths that already exist and already log.

## Decision

**A minimal worker health server (plain `node:http`) plus curated Prometheus metrics via `prom-client` on both processes.**

- **Worker** (`DEVFLOW_WORKER_HOST`/`_PORT`, default loopback:3002 — containers set 0.0.0.0): `GET /healthz` (a `SELECT 1` + Redis `PING` — what compose polls) and `GET /metrics`. Plain `node:http` on purpose: two fixed routes don't justify a framework in a process that deliberately has none.
- **API:** `GET /metrics` on the main port; an `onResponse` hook records a request-duration histogram (route/method/status, self-scrapes excluded) and webhook-delivery outcomes derived from the ADR-0005 status contract (202 accepted / 200 duplicate / 401 rejected / 400 invalid) — zero changes to route code. The hook is installed on the **root** Fastify instance, not via a plugin — encapsulation would silently scope it to nothing (a bug the tests caught).
- **Curated worker set:** jobs by result + duration histogram (from BullMQ lifecycle events), queue-state gauges refreshed on a 15 s poll (`failed` = the DLQ — the alertable number), embeddings created, check runs written (created/updated), live events by type. Default Node process metrics on both.
- **Registry shape:** per-instance in the API (tests build many apps per process; module-level registration would collide), module-level in the worker (one process, stages increment directly).
- **Exposure posture, stated:** `/metrics` is unauthenticated. The worker's port is not published outside the compose network; the API's is on the public port and the self-hosting guide says "allow only your monitoring network at the reverse proxy". Accepted MVP posture; revisit if multi-tenant deployments materialize.
- **Recorded side-effect:** `prom-client` depends on `@opentelemetry/api`, which satisfied drizzle-orm's _optional_ peer in api/worker only and split drizzle into two nominally-incompatible type variants. Fixed by declaring the same peer in `packages/db` so every consumer resolves one variant — noted here because it will look mysterious in the lockfile forever.

## Alternatives considered

- **OpenTelemetry (metrics + traces)** — rejected for MVP: SDK + collector weight for a solo two-process deployment with no tracing consumer; the recorded trigger is a genuine multi-hop debugging need (e.g. multiple API instances or external service calls beyond GitHub).
- **StatsD / push gateways** — rejected: a pull endpoint needs no agent and matches how self-hosters already run Prometheus.
- **A JSON stats endpoint instead of Prometheus text** — rejected: nonstandard scrape target; prom-client costs one dependency and speaks the ecosystem's language.
- **"Logs are enough"** — rejected: queue depth, DLQ size and latency percentiles are aggregates; deriving them from logs means shipping a log pipeline, which is strictly heavier than this ADR.
- **Fastify metrics plugins (`fastify-metrics`)** — rejected: our hook is ~30 lines and the plugin's defaults (per-route registration knobs, plugin encapsulation questions) are exactly what we'd configure away.

## Consequences

- Compose healthchecks (ADR-0020) poll real dependency checks, not process existence; an operator gets `docker compose ps` truthfulness for free.
- Grafana-ready out of the box: scrape two targets, alert on `devflow_queue_jobs{state="failed"}`.
- The worker now owns one listening socket; graceful shutdown closes it alongside the queue connections (same SIGTERM path).
- Metric names are API surface (`devflow_*`); renames are breaking changes for dashboards and get changelog entries.
