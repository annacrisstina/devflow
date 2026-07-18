# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-07-18 (end of session)

## Current repository status

- **`main`:** at `3a7116a` (Milestone 0), in sync with `annacrisstina/devflow`.
- **Branch `feat/db-webhook-events`** (local only — the engineer has no push credentials): **Milestone 1 complete and locally verified**, as five commits:
  1. `feat(db): add webhook_events schema, migrations and db client`
  2. `feat(api): scaffold Fastify API with config validation and health endpoint`
  3. `feat(ingest): add HMAC-verified idempotent GitHub webhook endpoint`
  4. `docs(docs): add GitHub App setup guide and integration ADR`
  5. `docs(docs): record milestone 1 completion in project memory` (this commit)
- **Local infra:** compose containers healthy; migration 0000 applied to the dev DB; `webhook_events` empty (e2e test rows cleaned).
- **`.env` exists locally** (gitignored) with a generated `DEVFLOW_GITHUB_WEBHOOK_SECRET`.

## Milestone 1 — what shipped

See [development-log.md](../development-log.md) entry M1 for the full record. Short version: `@devflow/db` (webhook_events, migrations, client) + `@devflow/api` (Fastify 5, env-validated config, pino, `/healthz`, graceful shutdown) + `POST /webhooks/github` (raw-body scoped parser → constant-time HMAC before any parsing → atomic delivery-GUID-idempotent insert → 202/200/401/400/500) + GitHub App setup guide + ADR-0003…0006 + real CI gates (Postgres service container). 13 automated tests + live smee-tunnel e2e, all green.

## Founder actions to close M1 (in order)

1. **Push the branch** and open the PR. The per-component-PR plan was blocked by missing credentials; options:
   - _Simplest:_ one PR, squash-merge with title `feat(ingest): add GitHub App webhook ingestion skeleton` (commitlint-valid). Cost: M1 becomes one commit on `main`.
   - _If per-component history on `main` matters:_ push the branch, then open+merge four sequential PRs by branching off each commit (`git branch tmp <sha>`), oldest first. More clicks, preserves granularity. The five local commits are already commitlint-valid individually.
2. **Confirm CI is green on GitHub** — first run with the Postgres service container and real gates (closes the M0 review's withheld confidence too).
3. **Create the GitHub App** following [docs/github-app-setup.md](../github-app-setup.md) (least privilege; do NOT generate a private key yet), install it on a repo with a workflow, and watch a real delivery land: `SELECT delivery_id, event_type FROM webhook_events ORDER BY id DESC LIMIT 5;`
4. **Confirm Milestone 1** so Milestone 2 design can start (milestone workflow rule 6).

## Next milestone: M2 — artifact pipeline (queue + workers + JUnit parsing)

Scope per [roadmap.md](../project-memory/roadmap.md): `apps/worker`, BullMQ, installation-token client (JWT → installation token; the App **private key enters the system here** — generate it only now), artifact download + streaming JUnit XML parsing with real fixtures, normalized runs/suites/results schema, retries + DLQ, correlation IDs across api→queue→worker. ADRs due: BullMQ; test-results data model + partitioning; workspace multi-tenancy schema. **Design step first** (goal + decisions for founder approval before files), per milestone workflow.

## Remaining blockers

- Founder actions above. Nothing else blocks M2 design (which can start on founder approval even before the GitHub App exists — but real-data testing in M2 needs the App installed).

## Repository health

- `pnpm verify` fully green locally (format, lint, typecheck, build, 13 tests). CI on GitHub not yet exercised for M1 (push pending).
- Suggested PR title if single-PR route: `feat(ingest): add GitHub App webhook ingestion skeleton`.

## Known technical debt (accepted, tracked)

1. C2: commitlint CI job installs the whole workspace just to lint messages → isolate when it hurts.
2. `docs/architecture/` placeholder → populate from real code by M2 (ingestion diagram now has real code to describe).
3. Integration tests need a reachable Postgres (compose/service container) — Docker-less `pnpm verify` fails at the test leg; accepted (fixtures-over-mocks applied to the database).
4. dotenv v17 emits a banner unless `quiet: true` — already handled in `apps/api`; remember it for future packages loading `.env`.

## Environment notes (this machine)

- WSL2; repo on `/mnt/d` (drvfs) → fs ops ~10–30× slower than ext4; cold server start can exceed 2s — poll, don't sleep-once. Move-to-ext4 recommendation stands; founder undecided.
- pnpm via corepack shim at `~/.local/bin/pnpm` (`corepack enable --install-directory ~/.local/bin`, no sudo). Turbo requires `pnpm` on PATH; if a shell lacks it: `export PATH="$HOME/.local/bin:$PATH"`.
- Node 20.19.4 local (`.nvmrc` targets 22; engines floor `>=20.19.0` keeps local working). `jq` not installed (use `node -e` for JSON work). No `gh` CLI; no non-interactive git credentials.
- GitHub username: `annacrisstina`. Contact email in SECURITY/CoC: rohike.contact@gmail.com.

## Things to remember before continuing

- Follow the **milestone workflow** and the **NEVER list** in [implementation-rules.md](../project-memory/implementation-rules.md) — design before files, run verifications for real, founder confirmation at milestone boundaries.
- Update this file at the end of every session; append to [development-log.md](../development-log.md) after every milestone; update project-memory docs when significant decisions are made.
- The founder communicates in Romanian; the repository is entirely in English.
