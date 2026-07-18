# ADR-0004: Fastify for the HTTP API

- **Status:** Accepted
- **Date:** 2026-07-18
- **Deciders:** founder + lead engineer

## Context

Milestone 1 introduces `apps/api`, whose defining workload is webhook ingestion: many small, bursty, hostile-until-verified JSON POSTs that must be acknowledged fast (GitHub times out slow webhook consumers). The same app will later serve the REST API for the web UI. We need an HTTP framework for Node/TypeScript that fits that shape and stays explainable — every dependency in this project must be defensible in an interview.

## Decision

We will use **Fastify** (v5) as the HTTP framework.

- Validation at the boundary via Fastify's native JSON Schema support; invalid input never reaches business logic. Environment configuration uses the same mechanism (`env-schema`, the library behind `@fastify/env`) so there is one validation idiom, applied at boot for config and per-request for routes.
- Logging is Fastify's built-in pino: structured JSON with request-scoped ids from day one.
- Apps are built as a `buildApp(config)` factory separate from the listening entrypoint, so tests exercise the real instance through `inject()` without ports.
- Encapsulated plugins are the composition unit (routes, and in the webhook case a scoped raw-body content parser).

## Alternatives considered

- **NestJS** — the most enterprise-recognizable choice, but its DI/decorator framework adds ceremony that obscures rather than teaches at this scale; the portfolio value lies in being able to explain exactly what happens between socket and handler, which Nest actively abstracts.
- **Express** — the default reflex, but it has no first-class validation or structured logging story (both would be third-party bolt-ons), and its middleware model makes the "verify raw bytes before any parsing" requirement clumsier than Fastify's explicit content-type parsers.
- **Next.js API routes** — erases the backend/frontend boundary the portfolio needs to demonstrate, and couples ingestion uptime to the UI deployment.
- **Hono** — modern and fast, but its edge-first design buys nothing here (we are a long-running Node process with a Postgres pool), and its ecosystem for this workload is thinner than Fastify's.

## Consequences

- Excellent throughput for the ingestion path and first-class schema validation come "for free"; pino integration gives structured logs without extra wiring.
- Fastify is less famous than Express/NestJS on a CV; accepted — the compensation is cleaner architecture discussions (this trade-off was already recorded pre-code in project memory D2).
- We commit to Fastify's plugin/encapsulation model; code that fights it (global mutable state, out-of-band route registration) is a smell to reject in review.
- v5 is current; its plugin ecosystem occasionally lags major bumps — mitigated by using few plugins (none besides core in M1).
