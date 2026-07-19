# Architecture Context

> Part of the [project memory](../README.md#project-memory). The architectural assumptions and philosophies that constrain all future design work. Nothing here is code yet — this is the frame the code must fit into. When implementation contradicts an assumption below, either the implementation is wrong or this document must be consciously amended (with an ADR).

## System shape (target architecture)

```
GitHub (webhooks: workflow_run, check_run, ...)      GitHub (REST/GraphQL: artifacts, checks)
        │                                                     ▲
        ▼                                                     │
┌──────────────┐   enqueue   ┌─────────────┐   read/write   ┌─┴───────────┐
│  apps/api     │ ─────────▶ │ Redis/BullMQ │ ◀───────────── │ apps/worker │
│  (Fastify)    │            └─────────────┘                 │ (parse,     │
│  - HMAC verify│                                            │  score)     │
│  - raw persist│                                            └─────┬───────┘
│  - fast ACK   │                                                  │
│  - REST API   │◀──── Redis pub/sub (live events) ────────────────┘
│  - Socket.IO  │                                   ┌──────────────┐
└──────┬────────┘                                   │  PostgreSQL  │
       │              reads/writes                  │  (+pgvector) │
       └───────────────────────────────────────────▶│  source of   │
┌──────────────┐         HTTP/WS                    │  truth       │
│  apps/web     │ ◀────────────────────────────────▶└──────────────┘
└──────────────┘
```

## System boundaries

- **We consume, we do not replace:** GitHub is the system of record for code, PRs and CI execution. DevFlow never stores repository contents — only run metadata, test results and derived scores.
- **Apps never import from apps; packages never import from apps.** Shared logic descends into `packages/*` or it doesn't get shared.
- **The ingestion boundary is an adapter seam:** GitHub Actions is the only adapter in MVP, but nothing outside the adapter may know GitHub-specific payload shapes. Normalized internal events are the contract.
- **The AI layer is amputable:** every AI feature sits behind an interface such that deleting the layer leaves a fully functional product. This is an architectural invariant, not just a product stance.

## Scalability goals (honest, bounded)

- Design target: **hundreds of installed repositories, webhook bursts of ~100+ events/min** (a monorepo push fanning out dozens of workflow runs), millions of test-result rows. NOT designed for: GitHub-scale, multi-region, five-nines.
- The scaling story to tell: ACK-fast ingestion (persist raw, enqueue, return 2xx quickly — GitHub times out slow webhook consumers), horizontal worker scaling via queue concurrency, read-side aggregates precomputed by workers rather than computed per-request.
- Time-partitioned storage for high-volume tables (test results, run events) is the assumed strategy; exact partitioning is a data-model-milestone decision.

## Security assumptions

- **Webhook ingress is hostile territory:** every payload is unauthenticated until its HMAC signature (`X-Hub-Signature-256`) is verified against the webhook secret, with a constant-time comparison. Unverified payloads are rejected before parsing.
- **Tokens are short-lived and scoped:** GitHub App installation tokens (≤1h) are cached but never persisted long-term; the app private key is the crown jewel (env-injected, never in the repo, never logged).
- **Secrets management:** environment variables only (12-factor). `.env` is gitignored; `.env.example` documents every variable with safe defaults. No secrets in compose files, CI logs or error messages.
- **Multi-tenant isolation is a schema-level concern:** every tenant-owned row reaches its workspace through the installation chain; enforcement is application-layer scoping with per-endpoint cross-tenant denial tests, RLS deferred with an explicit trigger (decided in ADR-0012) — isolation must not depend on developer discipline alone.
- **Supply chain:** SHA-pinned actions, Dependabot, pnpm script-blocking (see engineering-decisions.md D13).

## Deployment philosophy

- **Self-hostable is a feature, not an afterthought:** `docker compose up` must bring up the entire product. Anything that breaks this (managed-only dependencies) is rejected by default.
- **Dev/prod parity where it matters:** same Postgres major, same Redis semantics; but dev runs app code natively for debuggability (containers hold state, not code).
- **The founder's own deployment doubles as the demo** and dogfood: DevFlow watches DevFlow's CI.

## API philosophy

- **Boring, explicit REST** for the public surface; JSON Schema validation at the Fastify boundary (invalid input never reaches business logic).
- **Webhooks in, webhooks verified; APIs out, APIs rate-limit-aware.** All GitHub REST/GraphQL calls go through a client wrapper that understands rate-limit headers and backs off with jitter — hitting a rate limit is an expected state, not an error.
- **Idempotency is the default posture:** webhook delivery is at-least-once and out-of-order; every consumer must tolerate duplicates (delivery GUID as idempotency key) and late arrivals (reconciliation over assumed ordering).
- Versioning, pagination and error-shape conventions were decided when the first public endpoints landed (M4, ADR-0014): `/api/v1`, `{error:{code,message}}`, limit/offset with totals.

## Database philosophy

- **Postgres is the single source of truth** — relational data, derived scores, embeddings (pgvector), all in one place with one backup story.
- **SQL stays visible:** Drizzle was chosen precisely because it doesn't hide queries; schema is code-reviewed DDL, migrations are explicit and forward-only.
- **Raw before derived:** ingested webhook payloads are persisted raw (append-only) before any interpretation. Derived tables (normalized runs, test results, scores) can always be rebuilt from raw events. This is the event-sourcing-lite stance: replayability without full event-sourcing ceremony.
- **naming:** `snake_case`, plural tables (see docs/conventions.md).

## Event-driven philosophy

- The system is **ingestion-driven**: nothing polls when a webhook can push; polling exists only as reconciliation for missed deliveries.
- **Queues decouple receipt from processing:** the API's only ingestion job is verify → persist raw → enqueue → ACK. Everything expensive (artifact download, parsing, scoring) happens in workers with retries, backoff and dead-letter queues.
- **At-least-once + idempotent consumers** is the delivery contract everywhere. "Exactly-once" is acknowledged as a myth worth explaining in interviews.
- **Backpressure over collapse:** bounded queue concurrency, and burst absorption is a stated design requirement of the ingestion path.

## Observability philosophy

- **Structured logs from day one** (JSON, request-scoped correlation IDs that follow a webhook delivery through queue and workers).
- **The product is observability for CI, so it must be observable itself** — metrics on queue depth, processing latency, webhook-to-result lag. Instrumentation lands with the code, not retrofitted.
- Specific stack (pino is the working assumption for logs; metrics/tracing tooling) gets decided in the milestone that ships it.

## Engineering principles (the constitution)

1. **Architecture before code, always** — no milestone starts without design decisions stated and challengeable.
2. **Honest engineering** — no green badges over vacuous gates without saying so; no claimed features that don't exist; verification means running things, not asserting them.
3. **Every significant decision leaves a written trail** (ADR or project memory).
4. **Milestone discipline** — repository is working at every milestone boundary.
5. **Smallest true scope** — one CI provider done deeply, one report format, one killer detection algorithm. Depth beats breadth for both users and interviews.
6. **The founder must be able to defend every line** — no dependency or pattern goes in that can't be explained in an interview. If a choice can't be justified out loud, it's the wrong choice.
