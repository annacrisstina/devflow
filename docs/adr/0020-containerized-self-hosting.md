# ADR-0020: Containerized self-hosting — one compose file, two modes

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** founder + lead engineer

## Context

M6's release gate says "a stranger can run this" (`docker compose up` in the MVP definition), and NEVER-11 forbids breaking that path with managed-only dependencies. Until now compose carried only dev infrastructure (Postgres, Redis) and the applications ran natively via `pnpm dev` — the right dev workflow (hot reload, debuggers), but no self-host story. The two audiences pull in opposite directions: developers need the infra-only file untouched, self-hosters need the whole product with one command and a `.env`.

## Decision

**One `compose.yaml` with a `full` profile: the default invocation stays dev-infra-only; `docker compose --profile full up` runs migrate + API + worker in containers.**

- **Multi-stage Dockerfiles on `node:22-slim`** (Debian): glibc for the native prebuilds (`onnxruntime-node`, pg), and the `.nvmrc`-targeted Node 22 finally runs somewhere real. Dependencies are installed inside the image from the lockfile (`--frozen-lockfile`); `.dockerignore` excludes `node_modules`/`dist` so host state never leaks into images (and the drvfs context transfer stays small). The runtime stage is a pruned `pnpm deploy --legacy --prod` layout running as `USER node`.
- **One image for API + migrations.** The compose `migrate` service is the API image with `command: node dist/migrate.js` — a one-shot runner over the committed SQL files using drizzle's programmatic migrator (the same code path the integration tests build every schema from; no drizzle-kit in production). `api` and `worker` gate on `service_completed_successfully`, so a failed migration halts the rollout instead of booting apps against a half-migrated schema. The runner deliberately loads only `DEVFLOW_DATABASE_URL`, not the app config — migrating must not demand OAuth secrets.
- **The dashboard ships inside the API image** (built `apps/web/dist`, served same-origin behind `DEVFLOW_WEB_DIST` — the ADR-0013 cookie model needs no extra origin, so no separate web container or nginx exists.
- **The embedding model is baked into both app images at build time** (`warm-model.js` downloads it and runs one inference, then the layer caches until the model id changes). The worker embeds failure texts, the API embeds `/search` queries (ADR-0018); baking both keeps air-gapped deploys working with zero first-boot downloads.
- **Healthchecks poll `/healthz` via `node -e fetch(...)`** — the ADR-0021 dependency checks, not process existence; `curl` does not exist in slim images. Orchestration flows from them (`depends_on: service_healthy`).
- **Security posture:** the API publishes on `127.0.0.1:3001` unless `DEVFLOW_API_PUBLISH` overrides it — real deployments put a TLS-terminating proxy in front and set `DEVFLOW_TRUST_PROXY=on` (self-hosting guide). The worker's port stays inside the compose network. Secrets interpolate from the repo-root `.env` with empty fallbacks, so the dev path never demands them; each app's boot validation is the guard that refuses to run misconfigured.

## Alternatives considered

- **A separate `compose.prod.yaml`** — rejected: two topologies drift; profiles keep one file where the dev services are the same containers the full profile builds on.
- **Alpine base images** — rejected: musl breaks the `onnxruntime-node` prebuilt binaries that ADR-0018 depends on; slim is the smallest glibc option.
- **Migrations on application boot** — rejected: two processes racing the same DDL, and a failed migration should stop the rollout, not crash-loop the API.
- **Publishing prebuilt images (GHCR)** — deferred, not rejected: build-from-source is the v0.1 story; registry publishing belongs with release automation and gets its own decision.
- **A shared model volume instead of baked layers** — rejected: reintroduces a first-boot download (breaking air-gap) plus a stateful volume to manage, to save ~25 MB per image.

## Consequences

- A stranger runs the product with `git clone`, a filled `.env`, and `docker compose --profile full up -d --build` — the MVP release gate's self-host clause is met.
- The dev workflow is byte-identical to before: `docker compose up` still starts only Postgres and Redis.
- Upgrades are `git pull` + rebuild; the migrate service re-runs idempotently before apps start.
- Both app images carry the ~25 MB model; image size is traded for deterministic, air-gapped boots.
- `docker compose ps` tells the truth (ADR-0021 healthchecks) and `stop_grace_period: 30s` honors the graceful-shutdown paths both apps already implement.
