# 🔍 DevFlow

> **CI reliability for GitHub Actions** — detect, quantify and quarantine flaky tests before they erode your team's trust in CI.

[![CI](https://github.com/annacrisstina/devflow/actions/workflows/ci.yml/badge.svg)](https://github.com/annacrisstina/devflow/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/annacrisstina/devflow)](https://github.com/annacrisstina/devflow/releases/tag/v0.1.0)

**Status: v0.1.0 released.** The MVP is feature-complete and self-hostable with one command: webhook ingestion → artifact parsing → deterministic flakiness scoring → advisory PR check runs, plus a workspace dashboard with GitHub login, a live run feed, human-approved quarantine, and a fully removable assistive AI layer. Validated end-to-end against the real GitHub API ([validation](#validation)); a longer dogfood soak (Stage 2) follows.

## The problem

A flaky test — one that passes and fails nondeterministically without code changes — is the most expensive kind of noise in a CI pipeline. It blocks merges, forces re-runs, and worst of all it trains engineers to ignore a red build. Existing solutions (BuildPulse, Trunk, Datadog CI Visibility) are closed SaaS. DevFlow runs on your own infrastructure: it ingests your GitHub Actions results, identifies which failures are flakiness rather than regressions, and tells you on the PR itself.

## How it works

1. Install the DevFlow GitHub App on your repositories.
2. Every workflow run is ingested via webhooks; test reports (JUnit XML) are parsed in background workers.
3. A statistical engine scores each test's flakiness from its history (same commit, different outcomes; pass/fail transitions without related changes).
4. Known-flaky failures are annotated directly on your PR checks; quarantine is proposed — never applied automatically.
5. The dashboard shows ranked flaky tests with their evidence, a live run feed, semantic search over failure history, and the quarantine workflow.

## Engineering highlights

- **Every significant decision is recorded** — 22 accepted [Architecture Decision Records](docs/adr/) with the alternatives that were rejected and why, from the [detection algorithm](docs/adr/0010-flakiness-detection-algorithm.md) to the [AI boundary](docs/adr/0017-the-ai-boundary.md).
- **Validated, not just tested** — every end-to-end claim was re-verified against the real GitHub API in a pre-registered validation stage ([details](#validation)).
- **Deterministic core, assistive AI** — detection is a two-signal statistical evidence model ([ADR-0010](docs/adr/0010-flakiness-detection-algorithm.md)); AI never makes a decision, and deleting the AI package leaves the product working — a boundary enforced by a deletion test ([ADR-0017](docs/adr/0017-the-ai-boundary.md)).
- **Idempotent by design** — HMAC-verified webhook ingestion persists raw payloads append-only and absorbs GitHub redeliveries by delivery GUID ([ADR-0005](docs/adr/0005-raw-first-idempotent-webhook-ingestion.md)); artifact parsing is replace-per-run; PR annotation is PATCH-idempotent.
- **One verify gate** — `pnpm verify` (format, lint, typecheck, build, test) is exactly what CI runs; green locally means green remotely. At v0.1.0 that is 203 tests across five packages, plus a scripted end-to-end harness (`pnpm e2e`).
- **Dogfooding** — this repository's own CI uploads its JUnit results for a DevFlow deployment to ingest.
- **Disciplined history** — Conventional Commits enforced by commitlint, squash-merge linear history, SHA-pinned GitHub Actions, weekly grouped Dependabot.

## Tech stack

| Layer           | Choices                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Language        | TypeScript (`strict`) on Node.js 22, end to end                                                                      |
| Monorepo        | pnpm workspaces + Turborepo                                                                                          |
| API             | Fastify 5; Auth.js for GitHub login (database sessions)                                                              |
| Background jobs | BullMQ on Redis 7                                                                                                    |
| Database        | PostgreSQL 17 + pgvector, Drizzle ORM                                                                                |
| Dashboard       | React 19, Vite, Tailwind CSS 4, TanStack Query, Socket.IO live feed                                                  |
| AI layer        | Local MiniLM embeddings (ONNX on CPU — no key, no external calls); optional BYO-key Claude for root-cause hypotheses |
| Testing         | Vitest against real Postgres/Redis; scripted e2e harness against a simulated GitHub                                  |
| Operations      | Docker Compose self-hosting, `/healthz` + Prometheus `/metrics`, GitHub Actions CI                                   |

## Architecture

Three deployables over two backing services: a Fastify **API** that verifies and persists webhooks and serves the REST + Socket.IO surface, a BullMQ **worker** that fetches run artifacts, parses JUnit XML and scores flakiness, and a React **dashboard**. Postgres is the source of truth; Redis dispatches jobs but never stores data. Full diagrams, drawn from the real code: [system overview](docs/architecture/system-overview.md).

## Validation

Every end-to-end claim was verified twice: first against a simulated GitHub (the 21-check `pnpm e2e` harness), then against the real GitHub API in a pre-registered validation stage — 13 hypotheses written down before testing, an append-only observation log, and a closeout: 12 confirmed, 1 not observable, no open clauses (Stage 1, completed 2026-08-07). **[Validation report](docs/validation/validation-report.md)**.

## Latest release

**[v0.1.0](https://github.com/annacrisstina/devflow/releases/tag/v0.1.0)** — the complete feature list and an honest **Known limitations** section are in the [CHANGELOG](CHANGELOG.md).

## Quick start (local development)

This runs the full product on your machine: API + worker + dashboard natively, Postgres + Redis in Docker, and real GitHub events delivered through a webhook tunnel. Budget ~20 minutes the first time; the GitHub App creation is one-time.

**Prerequisites:** Node.js ≥ 20.19 (22 LTS recommended — `nvm use` reads `.nvmrc`), pnpm 10 (`corepack enable` activates the version pinned in `package.json`), Docker with Compose v2, git, and a GitHub account.

### 1. Clone and check your toolchain

```bash
git clone https://github.com/annacrisstina/devflow.git
cd devflow
./scripts/doctor.sh        # verifies Node, pnpm, Docker, git
```

### 2. Create your environment file

```bash
cp .env.example .env
```

The infrastructure defaults work as-is; the GitHub values are filled in steps 3–4.

### 3. Create a webhook tunnel channel

GitHub must be able to deliver webhooks to your machine. Open <https://smee.io/new> — it redirects to a fresh channel URL like `https://smee.io/AbCdEfGh123`. Save it; it becomes the App's webhook URL (step 4) and the tunnel target (step 9).

### 4. Create and install your GitHub App

DevFlow integrates with GitHub as a GitHub App, so a dev machine needs its own. One-time, all on one form — GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App** (full walkthrough with troubleshooting: [GitHub App setup](docs/github-app-setup.md)):

- **Name:** `devflow-dev-<username>` · **Homepage URL:** this repo's URL
- **Webhook:** Active ✅ · **Webhook URL:** the smee channel from step 3 · **Webhook secret:** generate one with `openssl rand -hex 32` and also put it in `.env` as `DEVFLOW_GITHUB_WEBHOOK_SECRET`
- **Repository permissions:** Actions **Read-only**, Checks **Read and write**, Metadata **Read-only** — nothing else
- **Subscribe to events:** Workflow run, Installation
- **Where can this app be installed:** Only on this account
- Under _Identifying and authorizing users_: **Callback URL** `http://127.0.0.1:3001/api/auth/callback/github`; leave "Request user authorization (OAuth) during installation" **unchecked**; generate a **client secret**
- Under _Post installation_: **Setup URL** `http://127.0.0.1:3001/api/github/setup`, tick **Redirect on update**

Then generate a **private key** on the App's settings page (downloads a `.pem`) and finish `.env` — run these through your shell (the `$(…)` is command substitution):

```bash
echo "DEVFLOW_AUTH_SECRET=$(openssl rand -hex 32)" >> .env
echo "DEVFLOW_GITHUB_APP_ID=<App ID from the settings page>" >> .env
echo "DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64=$(base64 -w0 <downloads-dir>/devflow-dev-*.private-key.pem)" >> .env
# plus, edited into .env directly:
#   DEVFLOW_GITHUB_CLIENT_ID=<Client ID>            DEVFLOW_GITHUB_CLIENT_SECRET=<generated secret>
#   DEVFLOW_GITHUB_APP_SLUG=<the app's URL slug, e.g. devflow-dev-username>
```

Delete the downloaded `.pem` afterwards — the key lives only in `.env`. The API refuses to boot without its five values and the worker without the App ID + key: misconfiguration fails fast instead of half-working.

Finally: App page → **Install App** → your account → select a repository (the demo repository from step 12 is ideal).

### 5. Start the infrastructure

```bash
docker compose up -d       # Postgres 17 (pgvector) + Redis 7, loopback-bound
```

### 6. Install dependencies

```bash
pnpm install
```

### 7. Migrate the database

```bash
pnpm --filter @devflow/db db:migrate
```

### 8. Run the verify gate (recommended)

```bash
pnpm verify                # format check, lint, typecheck, build, test — exactly what CI runs
```

This also produces the compiled output that `pnpm demo:seed` and `pnpm e2e` require (they refuse to run unbuilt).

### 9. Run the product

```bash
pnpm dev                   # API :3001 · worker :3002 · dashboard :5173
```

In a second terminal, connect the webhook tunnel:

```bash
pnpm dlx smee-client --url https://smee.io/<channel> --target http://127.0.0.1:3001/webhooks/github
```

### 10. Sign in

Open **`http://127.0.0.1:5173`** in a real browser and sign in with GitHub, then click **Connect GitHub** to claim your App installation. Two rules that prevent confusing failures: use `127.0.0.1`, never `localhost` (cookies are host-scoped and the auth flow is anchored on `127.0.0.1`), and use a real browser, not an embedded webview (they drop the CSRF cookie).

### 11. Expected final state

The dashboard shows your workspace with the connected installation. Pushes to an installed repository appear in the live run feed; runs that upload JUnit XML artifacts are parsed and scored; known-flaky failures get an advisory annotation on the PR's **Checks** tab. Verification queries and troubleshooting: [GitHub App setup §6](docs/github-app-setup.md#6-verify-end-to-end).

### 12. Put data on the screen

Two options, complementary:

- **`pnpm demo:seed`** — replays a curated synthetic history through the real pipeline into your local database: a flaky test with evidence (~0.53), a suspected one, an always-failing test that correctly scores zero, failure clusters, and a quarantine proposal to approve. Sign in once first (step 10) so the demo attaches to your workspace — if you seed before ever logging in, just re-run it after the first login. Details and caveats: [demo tooling](scripts/demo/README.md).
- **Real flaky evidence** — create a repository from the [`scripts/demo/flaky-repo/`](scripts/demo/flaky-repo/) template (suggested name `devflow-demo-flaky`), install your App on it, push, and re-run failed jobs from the Actions UI a couple of times: same-commit divergence is the strongest signal, and the test climbs from _suspected_ to _flaky_.

## Self-hosting

The entire product also runs in containers with one command — multi-stage images, a one-shot migration service, dashboard and embedding model baked in, works air-gapped:

```bash
cp .env.example .env       # a GitHub App is still required — see Quick start, steps 3–4
docker compose --profile full up -d --build
```

Full guide (reverse proxy, operations, troubleshooting): **[docs/self-hosting.md](docs/self-hosting.md)**.

## Repository layout

```
apps/           Deployable applications: api (Fastify), worker (BullMQ), web (React SPA)
packages/       Shared internal packages: db (Drizzle), queue, contract, ai
docs/           Documentation
  adr/          Architecture Decision Records — the "why" behind every big choice
  architecture/ System overview with diagrams, drawn from real code
  validation/   The pre-registered v0.1.x validation record
scripts/        Developer tooling: doctor, e2e harness (pnpm e2e), demo seeder (pnpm demo:seed)
compose.yaml    Dev infrastructure by default; --profile full runs the whole product
```

## Documentation

**Design and decisions**

- [System architecture](docs/architecture/system-overview.md)
- [Architecture Decision Records](docs/adr/) — start with [ADR-0001](docs/adr/0001-record-architecture-decisions.md)
- [Engineering conventions](docs/conventions.md)
- [Development log](docs/development-log.md) — the engineering diary, one entry per milestone

**Running DevFlow**

- [Self-hosting guide](docs/self-hosting.md)
- [GitHub App setup](docs/github-app-setup.md)
- [Demo tooling](scripts/demo/README.md)

## About

DevFlow is a personal software-engineering portfolio project, built end-to-end by one engineer — product scoping, architecture, implementation, validation and documentation:

**Ana Tudosoiu** · [GitHub](https://github.com/annacrisstina) · [LinkedIn](https://www.linkedin.com/in/ana-tudosoiu/)

### Source availability

This repository is public so its code, architecture and engineering decisions can be read and evaluated. It is **not** an open-source project: no license is granted, all rights are reserved, and external contributions are not accepted. (Versions up to and including v0.1.0 were published under the MIT license; that grant applies to those historical versions only.)
