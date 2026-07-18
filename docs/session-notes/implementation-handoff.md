# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-07-18 (end of session)

## Current repository status

- **`main`:** pushed to `annacrisstina/devflow`; contains Milestone 0 as a single commit `3a7116a`. (Recorded for honesty: the founder committed with subject `chore: initial project setup`, not the suggested `chore(repo): scaffold monorepo foundation and engineering standards` — harmless, pre-dates CI enforcement.)
- **Working branch:** `feat/db-webhook-events` — Milestone 1, component 1 (`packages/db`) implemented and verified locally; **awaiting founder review + commit confirmation** (milestone workflow step 5–6).
- **Working directory:** `/mnt/d/PROIECTE + CURSURI/project/devflow` (WSL2, Windows-mounted drive — see Environment notes).
- **Local infra:** `devflow-postgres` (pgvector/pg17) + `devflow-redis` healthy via `docker compose up -d`; migration 0000 applied to the dev database.

## Milestone 1 — approved design and scope

The founder approved the M1 architecture review (2026-07-18) with a trimmed scope: **Fastify API, Drizzle db package, webhook endpoint, HMAC verification, raw persistence, basic end-to-end verification — everything else minimal.** Key approved decisions:

- M1 pipeline ends at "raw row persisted" — **no queue/BullMQ** (M2), **no installation-token client** (M2; the App private key never enters the M1 environment).
- `webhook_events`: append-only; `delivery_id` (text, unique) as idempotency key; `payload` jsonb (byte-fidelity consciously traded for queryability — signature verified at ingress); `event_type`/`action`/`installation_id` as extracted filter columns; no processing-state column; unbounded growth accepted until M2 partitioning ADR.
- Endpoint flow: raw-body capture → HMAC (constant-time) **before any parse or DB work** → `INSERT … ON CONFLICT (delivery_id) DO NOTHING` → 202 new / 200 duplicate; DB down ⇒ 500 (GitHub redelivery is the recovery path).
- GitHub App least privilege for M1: events `workflow_run`, `installation`, `installation_repositories`; permissions Actions:read + Metadata:read only (Checks:write deferred to M3, accepting re-approval friction).
- Implementation order (one component per PR, review stop after each): ① `packages/db` ✅ → ② `apps/api` skeleton (+ ADR Fastify) → ③ webhook endpoint (+ ADR ingestion model) → ④ GitHub App + smee dev loop + end-to-end proof (+ ADR GitHub App vs OAuth App) → ⑤ milestone close (docs, log, memory deltas).

## Component 1 (`packages/db`) — done, pending review

- New: root `tsconfig.base.json`; `packages/db` (schema `webhook_events`, migration `0000_create-webhook-events.sql`, `createDbClient`, integration tests incl. duplicate-GUID absorption); ADR-0003 (Drizzle).
- Changed: CI quality job gained a pgvector Postgres service container + `DEVFLOW_DATABASE_URL`; `turbo.json` test task declares the env var (Turbo strict env mode) and dropped the untrue `coverage/**` outputs; README vacuous-gate footnote removed (**debt E1 closed** — gate proven by a deliberate failing test exiting CI red locally); `.env.example` + `packages/README.md` updated.
- Verified by running: migration applied (`\d webhook_events` matches design), 3 integration tests green against real Postgres, root `pnpm test` exits 1 on a failing test, full `pnpm verify` green, `docker compose config -q` OK.
- Suggested squash/PR title: `feat(db): add webhook_events schema, migrations and db client`

## Next steps (in order)

1. Founder reviews component 1 → confirms commit/PR → first PR must show CI green on GitHub (also closes the withheld 8% from the M0 review: first real CI run, now with a service container).
2. Component 2: `apps/api` skeleton (Fastify boot, `@fastify/env` config, pino, `/healthz`, graceful shutdown, tests) + ADR-0004 Fastify. **Note: ADR numbering shifted** — 0003 = Drizzle (shipped with component 1), 0004 = Fastify, 0005 = ingestion model, 0006 = GitHub App vs OAuth App.
3. Component 3: webhook endpoint. 4. Component 4: GitHub App + smee + end-to-end. 5. Milestone close.

## Remaining blockers

- Founder review of component 1 (this session's stop point).
- GitHub App creation (founder, component 4) — not yet blocking.

## Repository health

- `pnpm verify` fully green with **real** typecheck/build/test gates (first package landed). CI service container untested on GitHub until the first M1 PR runs.

## Known technical debt (accepted, tracked)

1. ~~E1: vacuous typecheck/build/test gates~~ — **closed this session** (proven with a failing test).
2. C2: commitlint CI job installs the whole workspace (~1m40s cold) just to lint messages → isolate when it hurts.
3. `docs/architecture/` placeholder → populate during M1–M2 from real code.
4. New: integration tests require a reachable Postgres (compose locally, service container in CI) — a bare `pnpm verify` on a machine without Docker fails at the test leg. Accepted: real-database testing is the point (fixtures-over-mocks); documented in `packages/db/README.md`.

## Environment notes (this machine)

- WSL2; repo on `/mnt/d` (drvfs) → filesystem ops ~10–30× slower than ext4 (install ~1m35s). Standing recommendation: move repo to `~/dev/devflow`. Founder undecided.
- **pnpm on PATH solved without sudo** (supersedes the old `sudo corepack enable` note): `corepack enable --install-directory ~/.local/bin` — shim at `~/.local/bin/pnpm`, which Turbo needs on PATH to spawn package tasks. If a new shell lacks it: `export PATH="$HOME/.local/bin:$PATH"`.
- Node 20.19.4 local (out of LTS); `.nvmrc` targets 22 → `nvm install 22` still recommended; `engines` floor `>=20.19.0` keeps local working.
- GitHub username: `annacrisstina`. Contact email in SECURITY/CoC: rohike.contact@gmail.com.

## Things to remember before continuing

- Follow the **milestone workflow** and the **NEVER list** in [implementation-rules.md](../project-memory/implementation-rules.md) — design before files, run verifications for real, stop for founder review after every component, PRs only (never push `main`).
- Update this file at the end of every session; append to [development-log.md](../development-log.md) after every milestone; update project-memory docs when significant decisions are made.
- The founder communicates in Romanian; the repository is entirely in English.
