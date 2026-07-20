# Engineering Decisions

> Part of the [project memory](../README.md#project-memory). Every significant engineering decision, with motivation, alternatives, trade-offs, and why the final choice won. Formal ADRs live in [../adr/](../adr/); this document includes decisions made _before_ code existed (which therefore have no ADR yet) and summarizes the ADRs that do exist. When a pre-code decision reaches implementation, it gets a proper ADR and this document links to it.

## Status legend

- **Locked** — decided, implemented, ADR exists or is not needed.
- **Committed** — decided during design, not yet implemented; will receive an ADR in the milestone that implements it. May be revisited only with a strong technical reason.

---

## D1. Monorepo with pnpm workspaces + Turborepo — Locked (ADR-0002)

- **Decision:** single repository, `apps/*` (deployables) + `packages/*` (shared internals), pnpm for package management, Turborepo for task orchestration.
- **Motivation:** API, workers, web UI and shared packages evolve in lockstep; a solo team cannot afford cross-repo coordination.
- **Alternatives:** polyrepo (rejected: coordinated PRs + published shared packages = pure overhead solo; fragments the portfolio story); single-package monolith (rejected: the api/worker boundary is load-bearing for independent scaling — erasing it invites coupling); Nx (rejected: generator/plugin machinery is weight we don't need).
- **Trade-offs accepted:** one dependency tree means major bumps hit everything at once; CI must be task-graph aware (mitigated by Turbo caching).
- **Why pnpm specifically:** strict node_modules prevents phantom dependencies; `workspace:*` protocol makes internal deps explicit; pnpm 10 blocks dependency lifecycle scripts by default (supply-chain win).

## D2. Backend: Fastify + Drizzle ORM — Locked (ADR-0003, ADR-0004)

- **Decision:** Fastify as the HTTP framework, Drizzle as the SQL-first ORM, TypeScript throughout.
- **Motivation:** Fastify has first-class JSON schema validation, excellent throughput for a webhook-ingestion-shaped workload, and a plugin model that keeps the codebase explicit. Drizzle does not hide SQL — the founder must be able to discuss query plans, indexes and migrations fluently at interviews, and Drizzle keeps that knowledge exercised.
- **Alternatives:** NestJS + Prisma (rejected: DI framework adds ceremony that obscures rather than teaches at this scale; Prisma abstracts SQL away and complicates row-level access patterns); Next.js API routes (rejected: erases the backend/frontend boundary the portfolio needs to demonstrate); Go + sqlc (rejected: attractive for infra companies but splits the stack across two languages and slows a solo TS/React developer).
- **Trade-offs accepted:** Fastify is less "enterprise-recognizable" than NestJS; compensated by cleaner architecture discussions.

## D3. Auth: Auth.js (NextAuth) + Postgres, GitHub OAuth — Locked (ADR-0013)

- **Decision:** Auth.js with the GitHub OAuth provider, sessions/accounts persisted in our Postgres.
- **Motivation:** the user base is developers with GitHub accounts — GitHub OAuth is the only login that makes sense. Auth.js keeps auth open-source and self-hostable (a managed IdP would break the `docker compose up` self-hosting story). Owning the session table also preserves interview material without the risk of hand-rolling password auth (there are no passwords).
- **Alternatives:** Clerk (rejected: paid managed dependency contradicts self-hostability); Supabase Auth (rejected: couples the stack to Supabase); fully custom credentials auth (rejected: maximum security risk for negative signal — "reinvented auth" reads as poor judgment).
- **Note:** _user login_ (Auth.js) is distinct from _GitHub App authentication_ (app JWT → installation tokens), which is D6.

## D4. Real-time: Socket.IO self-hosted, Redis pub/sub for fan-out — Locked (ADR-0015)

- **Decision:** self-hosted WebSocket layer (Socket.IO) for the live run feed and dashboard updates; Redis pub/sub as the cross-process broadcast backbone.
- **Motivation:** demonstrating owned real-time infrastructure is a core portfolio goal; managed services (Ably, Liveblocks, Pusher) would delete that story and add cost.
- **Alternatives:** raw `ws` (rejected: Socket.IO's rooms/reconnection/fallbacks are exactly the boilerplate we shouldn't rewrite); Supabase Realtime (rejected: ecosystem lock-in).
- **Trade-offs accepted:** scaling WebSockets requires sticky sessions + the Redis adapter — accepted, and it is itself interview material.

## D5. Vector search: pgvector in the same Postgres — Locked (ADR-0018)

- **Decision:** embeddings for semantic search over failure history live in Postgres via the pgvector extension. The dev compose image is `pgvector/pgvector:pg17` from day one so the extension is always available and local volumes never need invalidating.
- **Motivation:** one source of truth, one backup story, no extra service to operate. Verified working locally (pgvector 0.8.5, `CREATE EXTENSION vector` succeeds).
- **Alternatives:** Qdrant/dedicated vector DB (rejected: justified only above ~10M vectors, far beyond MVP); Pinecone (rejected: managed + paid contradicts self-hosting).

## D6. GitHub integration: GitHub App, not OAuth App — Locked (ADR-0006)

- **Decision:** DevFlow installs as a **GitHub App** (app-level JWT → per-installation access tokens, granular permissions, native webhook subscription).
- **Motivation:** correct security model (permissions scoped per installation, short-lived tokens), per-installation rate limits (~5,000 req/h each rather than one shared pool), and it is the professional pattern every serious integration uses. The OAuth-App-vs-GitHub-App distinction is deliberate interview material.
- **Trade-offs accepted:** more complex auth dance (JWT signing, token exchange, token caching) — that complexity is the point.

## D7. Queue: BullMQ on Redis — Locked (ADR-0007)

- **Decision:** BullMQ for background jobs (artifact download, JUnit parsing, scoring), Redis as the broker. Dev Redis runs with AOF persistence so queued jobs survive container restarts (silent job loss in dev hides real bugs).
- **Motivation:** Redis is already in the stack for pub/sub and caching; BullMQ provides retries with backoff, dead-letter handling, concurrency control and rate limiting without introducing a second broker technology.
- **Alternatives:** Kafka/Redpanda (rejected: operationally heavy for a solo self-hostable product; a _documented consideration_ is better portfolio material than an _unjustified deployment_); Postgres-based queue e.g. pg-boss/SKIP LOCKED (a respectable alternative — rejected to keep queue semantics and observability first-class, but worth acknowledging in the ADR); RabbitMQ (rejected: another service to operate with no decisive advantage here).

## D8. Multi-tenancy: workspace-based — Committed (ADR ships with the M4 implementation; interim seam recorded in ADR-0008: installation is the tenancy root until workspaces exist)

- **Decision:** workspace = tenant (Notion/Linear style). Users can belong to multiple workspaces; a workspace owns GitHub App installations and everything downstream (repos, runs, results).
- **Motivation:** covers both the solo developer (personal workspace) and team/organization use without schema surgery later.
- **Alternatives:** per-user tenancy (rejected: kills the team story); institutional tenancy (rejected: EdTech leftover, wrong domain); hybrid personal+workspace (rejected: dual ownership doubles RLS complexity for no MVP benefit).
- **Note:** decided originally during the StudyRooms design and _deliberately re-validated_ for DevFlow — it survives because GitHub App installations naturally attach to a workspace-like owner.

## D9. Test report format: JUnit XML only in MVP — Locked (scope decision)

- **Decision:** the only ingested test report format is JUnit XML.
- **Motivation:** de-facto universal (Jest, Pytest, JUnit, dotnet test, Go via converters); every additional format multiplies parser surface and fixture matrix.
- **Trade-off accepted:** TAP/JSON-reporter users are excluded from MVP; the parser sits behind an interface so formats are additive later.

## D10. CI provider: GitHub Actions only in MVP — Locked (scope decision)

- **Decision:** single CI adapter (GitHub Actions), behind an ingestion seam designed for more.
- **Motivation:** each provider is its own auth + webhook + artifact model; one done deeply beats three done shallowly. "Extensibility demonstrated by design, not by code."

## D11. Tooling & standards bundle — Locked (implemented in M0)

- **ESLint 9 flat config + Prettier** (separate concerns: correctness vs formatting). One opinionated rule so far: **no default exports** (renames stay grep-able; config files exempted because tools require default exports).
- **Conventional Commits enforced by commitlint** with a **strict `scope-enum`** (`repo, ci, docs, api, web, ingest, worker, db, shared, deps`) — ad-hoc scopes are the first entropy in a git history.
- **GitHub Flow**: protected `main`, short-lived `type/kebab-description` branches, **squash merge** → linear history; therefore **PR titles are commitlint-checked in CI** (the title becomes the `main` commit subject — a detail most repos miss).
- **MIT license** (maximum recognizability for a portfolio OSS project).
- **Node 22 LTS** (`.nvmrc`), engines `>=20.19` for local compatibility, `.npmrc engine-strict=true`.
- **`pnpm verify`** = format check + lint + typecheck + build + test = exactly what CI runs. Green locally ⇒ green remotely.

## D12. Dev environment: containers for state, native for code — Locked (implemented in M0)

- **Decision:** `compose.yaml` runs only stateful backing services (Postgres, Redis); application code runs natively via `pnpm dev`.
- **Motivation:** hot-reload and debugger stay native; containers hold what must be reproducible.
- **Security posture:** ports bound to `127.0.0.1` explicitly (a dev database must never listen on the network, even reused on a demo VPS).

## D13. Supply-chain posture — Locked (implemented in M0 remediation)

- **GitHub Actions pinned to full commit SHAs** with version comments. Motivation: mutable tags are a real attack vector (tj-actions/changed-files incident, March 2025 — tag repointing exfiltrated secrets across thousands of repos). Lesson captured during implementation: annotated tags dereference to a _tag object_, not the commit — always resolve via the commits API.
- **Dependabot**: weekly, grouped minor+patch as one PR, majors individually (each breaking change gets its own review and revert point), github-actions ecosystem covered.
- **pnpm 10** blocks dependency lifecycle scripts by default.

## D14. AI boundary — Locked (formalized mechanically in ADR-0017; see project-overview.md)

- **Decision:** AI assists (clustering, summarization, semantic search), never decides (quarantine, flakiness verdicts, auto-resolution).
- **Motivation:** trust is the product's currency — a false "this is flaky" verdict from a hallucinating model destroys it. Deterministic detection with configurable thresholds + human approval is both better engineering and better interview material ("here is where I chose NOT to use AI, and why").

---

## ADR summary (formal records to date)

| ADR                                                           | Title                           | Status   | Essence                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](../adr/0001-record-architecture-decisions.md)          | Record architecture decisions   | Accepted | Nygard-format ADRs in `docs/adr/`, immutable once accepted, superseded not edited, land in the same PR as the change they justify. Significance test: "could a maintainer safely reverse this in an afternoon?"                                                                         |
| [0002](../adr/0002-monorepo-with-pnpm-and-turborepo.md)       | Monorepo with pnpm + Turborepo  | Accepted | See D1. Includes rejected alternatives (polyrepo, monolith, Nx) and accepted negatives.                                                                                                                                                                                                 |
| [0003](../adr/0003-drizzle-orm-for-database-access.md)        | Drizzle ORM for database access | Accepted | SQL stays visible (schema = reviewable DDL, committed forward-only migrations). Rejected: Prisma, Kysely, raw pg.                                                                                                                                                                       |
| [0004](../adr/0004-fastify-for-the-http-api.md)               | Fastify for the HTTP API        | Accepted | JSON-Schema validation at the boundary, pino built in, `buildApp()` factory for port-less tests. Rejected: NestJS, Express, Next API routes, Hono.                                                                                                                                      |
| [0005](../adr/0005-raw-first-idempotent-webhook-ingestion.md) | Raw-first idempotent ingestion  | Accepted | Authenticate raw bytes → parse → append-only persist (atomic `ON CONFLICT`) → fast ACK; 500 on db-down (redelivery recovers). GUID dedup ≠ semantic dedup (M2).                                                                                                                         |
| [0006](../adr/0006-github-app-not-oauth-app.md)               | GitHub App, not OAuth App       | Accepted | Installation-scoped short-lived tokens, granular permissions, per-installation rate limits, native webhooks. Rejected: PAT, OAuth App.                                                                                                                                                  |
| [0007](../adr/0007-bullmq-on-redis-for-background-jobs.md)    | BullMQ on Redis                 | Accepted | Queue = dispatch, never store (Redis loss loses scheduling, not data); jobId dedup best-effort; failed set = DLQ. Rejected: Kafka, pg-boss, RabbitMQ, no-queue.                                                                                                                         |
| [0008](../adr/0008-normalized-test-results-data-model.md)     | Test-results data model         | Accepted | Attempts as rows (M3 signal); replace-per-run idempotency (no unique key — parameterized tests); installation = tenancy root until M4; partitioning deferred with triggers.                                                                                                             |
| [0009](../adr/0009-in-house-github-app-client.md)             | In-house GitHub App client      | Accepted | Hand-rolled RS256 JWT (PKCS#1 gotcha), single-flight token cache, permanent-vs-transient classification. Rejected: Octokit, jose, Probot.                                                                                                                                               |
| [0010](../adr/0010-flakiness-detection-algorithm.md)          | Flakiness detection algorithm   | Accepted | Deterministic two-signal evidence model: same-commit divergence (weight 1.0) + default-branch transitions (0.25), exponential decay (H=14d), saturating score (K=2), under-flagging thresholds. Always-failing scores zero. Rejected: ML, failure-rate %, windowed counts, Bayesian.    |
| [0011](../adr/0011-advisory-checks-api-annotation.md)         | Advisory Checks API annotation  | Accepted | Check run on head_sha, always `neutral` (cannot block), silent when nothing to say, PATCH-idempotent via `flake_check_run_id`, evidence decomposed in plain language. Rejected: PR comments, commit status, failing conclusions.                                                        |
| [0012](../adr/0012-workspace-multi-tenancy.md)                | Workspace multi-tenancy         | Accepted | Workspaces own installations; tenancy resolves at read time (repo → installation → workspace). Unclaimed installations are first-class (backfill); claiming = signed-state Setup-URL redirect. App-layer isolation with per-endpoint denial tests; RLS deferred with a written trigger. |
| [0013](../adr/0013-authjs-on-fastify.md)                      | Auth.js on Fastify              | Accepted | `@auth/core` mounted via a ~40-line shim (no official Fastify binding); database sessions (cookie = revocable row); the GitHub App's own OAuth credentials. Rejected: hand-rolled OAuth, JWT sessions, managed IdPs.                                                                    |
| [0014](../adr/0014-public-api-conventions.md)                 | Public API conventions          | Accepted | `/api/v1`, `{error:{code,message}}`, limit/offset+total, bigints-as-strings. Decay-at-read: stored scores unwound to evidence, half-life-decayed, re-saturated — in SQL, so ordering/filters/pagination are consistent; SQL ≡ TS pinned by tests.                                       |
| [0015](../adr/0015-live-feed-transport.md)                    | Live feed transport             | Accepted | Worker → Redis pub/sub → Socket.IO workspace rooms; session-cookie handshake; explicitly best-effort (REST is truth, events trigger refetches). Rejected: Redis adapter now, LISTEN/NOTIFY, SSE, durable replay.                                                                        |
| [0016](../adr/0016-quarantine-workflow.md)                    | Quarantine workflow             | Accepted | Proposals are a query (no automated writer of quarantine state); decisions are durable rows (approve/dismiss/lift, partial unique index on active). Annotation labels quarantined failures; conclusion stays `neutral`.                                                                 |
| [0017](../adr/0017-the-ai-boundary.md)                        | The AI boundary, formalized     | Accepted | All AI code in `@devflow/ai` with enumerated call sites + a grep-verifiable deletion test; two advisory output sinks; the LLM runs only on human click; prompt-injection posture recorded. D14 made structural.                                                                         |
| [0018](../adr/0018-local-embeddings-and-semantic-search.md)   | Local embeddings + search       | Accepted | MiniLM (384-dim ONNX, CPU, ~25 MB) in-process — self-host-complete, measured 2–6 ms/text; content-addressed `failure_embeddings` (embed once per distinct text); exact cosine with an HNSW trigger; clustering = deterministic single-link geometry.                                    |
| [0019](../adr/0019-llm-provider-seam-and-hypotheses.md)       | LLM seam + hypotheses           | Accepted | One-method provider interface; plain-fetch Claude client (BYO key, `claude-haiku-4-5` default, 800-token cap); human-triggered, digest-cached, provenance-stamped advisory text. Rejected: SDK, multi-provider-now, background generation.                                              |

| [0020](../adr/0020-containerized-self-hosting.md) | Containerized self-hosting | Accepted | One compose file, two modes (`full` profile); multi-stage node:22-slim images (`pnpm deploy --legacy`); one-shot migrate service gating api/worker; dashboard + migrations + embedding model baked into images; loopback publish default. Rejected: separate prod compose, Alpine, migrations-on-boot, registry publishing (deferred), model volume. |
| [0021](../adr/0021-observability-health-and-metrics.md) | Observability: health + metrics | Accepted | Worker health server (plain `node:http`, `SELECT 1` + Redis PING) + curated `prom-client` metrics on both processes; instrumentation-never-behavior; `/metrics` unauthenticated by stated posture. Rejected: OpenTelemetry now, StatsD, JSON stats, fastify-metrics. |

## M6 remaining-scope decisions (founder-ratified 2026-07-19)

The remaining-scope review ([session-notes/m6-remaining-scope-review.md](../session-notes/m6-remaining-scope-review.md), produced from repository state after the original M6 review was lost) was approved with:

- **D-M6-1 — backfill cut from v0.1.0**: installation-time history backfill moves to post-MVP with its own design step; seed tooling + dogfooding cover the demo-data need.
- **D-M6-2 — seed = pipeline replay**: `pnpm demo:seed` replays a curated synthetic history through the real ingestion path (harness reuse, deterministic GUIDs, locality guard, direct-DB workspace attachment). Not a SQL dump.
- **D-M6-3 — flaky-repo demo**: template ships in-repo (`scripts/demo/flaky-repo/`); the real public repo is a founder artifact.
- **D-M6-4 — dogfood deployment**: local compose full profile + webhook tunnel; a VPS is optional later, not an M6 requirement.
- **D-M6-5 — versioning**: v0.1.0 = annotated git tag + GitHub Release; root version bumped; workspace packages stay private/unpublished.
- **D-M6-6 — Dependabot majors after the tag**, individually per D13.
- **D-M6-7 — D11 stays as-is during M6**: current merge policy unchanged; revisit outside the milestone.
