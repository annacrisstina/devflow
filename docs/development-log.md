# Development Log

> The engineering diary of DevFlow. One entry per completed milestone, appended in order — never rewritten. Together with [project-memory/](project-memory/) (knowledge) and [session-notes/implementation-handoff.md](session-notes/implementation-handoff.md) (operational state), this file forms the permanent memory of the project. By the final release it should tell the complete engineering story from Milestone 0 onward.

---

## Milestone 0 — Repository foundation

- **Date:** 2026-07-14
- **Milestone:** 0
- **Goal:** a repository foundation indistinguishable from a mature software company's first sprint — tooling, standards, governance, dev environment, CI — with zero business logic, leaving the repo in a verified working state.

### Completed work

- Monorepo: pnpm 10 workspaces + Turborepo 2 (`apps/*` + `packages/*`, intent-README placeholders only — no speculative scaffolding).
- Standards: ESLint 9 flat config (+ no-default-exports rule), Prettier, commitlint with strict scope enum, `.editorconfig`, engineering conventions doc.
- Git discipline: GitHub Flow, squash-merge, Conventional Commits; CI lints both commit messages and PR titles (title becomes the `main` commit subject under squash).
- CI (GitHub Actions): `quality` job runs exactly `pnpm verify` (local/remote contract) + compose validation; `commitlint` job on PRs; SHA-pinned actions; least-privilege permissions; per-branch concurrency cancellation.
- Dev environment: compose with `pgvector/pgvector:pg17` + Redis 7 (AOF), healthchecks, loopback-bound ports, `.env.example`; `scripts/doctor.sh` toolchain checker.
- Governance/OSS: README, MIT LICENSE, CONTRIBUTING, SECURITY (private reporting, severity scope), CODE_OF_CONDUCT (Contributor Covenant 2.1), CODEOWNERS (`@annacrisstina`), PR template, Issue Forms (bug/feature + config routing security reports off the public tracker), Dependabot (weekly, grouped minor/patch, individual majors, actions ecosystem).
- Supply chain: SHA pinning, Dependabot, pnpm 10 lifecycle-script blocking, `.gitattributes` LF normalization, `.npmrc engine-strict`.
- Project memory system: `docs/project-memory/` (7 documents), this log, and the session handoff.

### Files created

Root tooling: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `commitlint.config.mjs`, `.editorconfig`, `.gitignore`, `.gitattributes`, `.npmrc`, `.nvmrc`, `compose.yaml`, `.env.example` · Governance: `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` · GitHub: `.github/workflows/ci.yml`, `CODEOWNERS`, `PULL_REQUEST_TEMPLATE.md`, `dependabot.yml`, `ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml` · Editor: `.vscode/{extensions,settings}.json` · Docs: `docs/README.md`, `docs/conventions.md`, `docs/adr/{0001,0002,template}.md`, `docs/architecture/README.md`, `docs/project-memory/*` (7 files), `docs/session-notes/implementation-handoff.md`, this file · Scripts: `scripts/doctor.sh` · Placeholders: `apps/README.md`, `packages/README.md`.

### Files modified

(During review remediation:) `ci.yml` (SHA pins, compose validation step), `CODEOWNERS` + `README.md` (owner placeholders → real username; honest CI footnote), `compose.yaml` (loopback binding), `.gitignore` (selective `.vscode`), `CONTRIBUTING.md` (CoC link).

### ADRs created

- ADR-0001: Record architecture decisions (Nygard format, immutable, superseded-not-edited).
- ADR-0002: Monorepo with pnpm workspaces + Turborepo (rejected: polyrepo, single-package monolith, Nx).

### Engineering decisions

See [project-memory/engineering-decisions.md](project-memory/engineering-decisions.md) D1, D11–D13 for this milestone's decisions (monorepo, tooling bundle, dev-environment split, supply-chain posture) with full alternatives and trade-offs.

### Lessons learned

1. **Annotated tags lie about SHAs:** `pnpm/action-setup@v4.0.0`'s ref API SHA is a _tag object_, not the commit — pinning it verbatim would have broken CI. Always dereference via the commits API and verify pins against live data, not memory.
2. **Adversarial self-review works:** the readiness review of our own milestone found five genuine blockers (mutable tags, missing Dependabot, live placeholders, missing issue templates, missing CoC). A review that finds nothing in one's own work is a failed review.
3. **Honesty beats cosmetics:** the vacuous-CI-gate problem (typecheck/test with zero packages) was resolved by _disclosing it_ in the README rather than faking substance — the green badge must never claim more than it checks.
4. **Verify the environment, not just the code:** `corepack enable` needing sudo, drvfs slowness, and Node 20's LTS expiry were all discovered by running checks, and each changed a decision (engines floor, `.gitattributes`, doctor script content).

### Problems encountered

- `corepack enable` fails without sudo → session worked via `corepack pnpm`; founder to run once with sudo.
- Repo lives on `/mnt/d` (WSL2 drvfs): 1m42s install; move-to-ext4 recommendation stands, founder undecided.
- No prior-session transcripts existed at session start → this milestone's memory system is the structural fix.

### Technical debt introduced (accepted, tracked)

- E1: typecheck/build/test gates vacuous until first package (closes in M1; disclosed in README).
- C2: commitlint job installs full workspace to lint messages (isolate when it hurts).
- `docs/architecture/` placeholder (fill by M1–M2 from real code).

### Interview topics covered by this milestone

Monorepo trade-offs (pnpm strictness/phantom deps, Turbo task graph vs Nx), supply-chain security (SHA pinning + the annotated-tag gotcha, Dependabot strategy, lifecycle-script blocking), CI design (local/remote gate contract, PR-title linting under squash merge), engineering process (ADRs, adversarial review with severities, honest gates). Details: [project-memory/interview-notes.md](project-memory/interview-notes.md) §6–8.

### Status & next

- **Milestone 0: APPROVED** (formal readiness review, from-scratch re-verification, confidence 92% — withheld: first real CI run on GitHub + manual repo settings).
- **Next milestone:** M1 — GitHub App + webhook ingestion skeleton (`apps/api`, `packages/db`, HMAC-verified idempotent `/webhooks/github`, ADRs for Fastify/ingestion-model/GitHub-App).
- **Next immediate task:** founder makes the initial commit + pushes + configures GitHub settings (see [handoff](session-notes/implementation-handoff.md)); then M1 design step.

---

## Milestone 1 — GitHub App + webhook ingestion skeleton

- **Date:** 2026-07-18
- **Milestone:** 1
- **Goal:** GitHub events flow into Postgres, verified and idempotent — the spine every later milestone consumes. Scope was founder-trimmed to: Fastify API, Drizzle db package, webhook endpoint, HMAC verification, raw persistence, end-to-end verification; everything else minimal.

### Completed work

- `packages/db` (`@devflow/db`): `webhook_events` append-only table (delivery-GUID unique key, jsonb payload, extracted filter columns), committed forward-only SQL migration, `createDbClient` factory, integration tests against a recreated-from-migrations throwaway database.
- `apps/api` (`@devflow/api`): Fastify 5, boot-time env validation (env-schema; missing webhook secret = refusal to boot), pino structured logs, `GET /healthz` (db reachability), graceful shutdown, `buildApp()` factory for port-less testing.
- `POST /webhooks/github`: scoped raw-body content parser → constant-time HMAC verification **before any parsing or DB work** → `INSERT … ON CONFLICT (delivery_id) DO NOTHING` → 202 new / 200 duplicate / 401 bad signature / 400 malformed / 500 db-down (redelivery is the recovery path). Delivery GUID is the log correlation key.
- CI gates made real: pgvector Postgres service container in the quality job; `turbo.json` declares `DEVFLOW_DATABASE_URL` (strict env mode); vacuous-gate README footnote removed — **debt E1 closed**, proven by a deliberate failing test exiting CI red locally before being removed.
- GitHub App setup guide (`docs/github-app-setup.md`): least-privilege M1 configuration (Actions:read + Metadata:read, `workflow_run` events, **no private key generated** — M2 needs it first), smee.io dev loop, troubleshooting.
- Root `tsconfig.base.json`; `.env.example` extended; package/app READMEs.

### Verification (all run, not asserted)

13 automated tests green (signature unit tests; webhook + health integration tests on real Postgres), full `pnpm verify` green, and a live end-to-end pass: signed payload → **public smee.io tunnel** → local API → HMAC verified → row in Postgres with correct extracted columns; redelivered GUID absorbed (200, still one row); tampered body and unsigned junk rejected 401 with zero rows; SIGTERM shutdown clean.

### ADRs created

- ADR-0003: Drizzle ORM (rejected: Prisma, Kysely, raw pg).
- ADR-0004: Fastify (rejected: NestJS, Express, Next API routes, Hono).
- ADR-0005: Raw-first idempotent ingestion (rejected: normalize-on-ingest, queue-as-store, check-then-insert, byte-fidelity storage, exactly-once pretensions).
- ADR-0006: GitHub App, not OAuth App (rejected: PAT, OAuth App).

### Lessons learned

1. **Run the path, not just the tests:** resolving the migrations folder via `URL.pathname` passed review but broke at runtime on this repo's space-containing path — caught only because verification executes; fixed with `fileURLToPath`.
2. **Tunnels re-serialize:** smee's client re-serializes JSON, so HMAC through a tunnel only verifies if the posted bytes are canonical-compact — a nuance that would have burned hours during real GitHub testing had e2e not been rehearsed.
3. **Stale processes lie:** an earlier server instance still holding the port made a fresh build "pass" its health check; the EADDRINUSE in the new process's log was the only tell. Check who owns the port before trusting a green curl.
4. **The M0 corepack annoyance had a sudo-free fix all along:** `corepack enable --install-directory ~/.local/bin` — required anyway, because Turbo spawns `pnpm` from PATH.

### Problems encountered

- No git credentials available to the engineer → pushing and PR creation are founder actions; components landed as sequential commits on `feat/db-webhook-events` instead of one PR each (deviation recorded in the handoff, with merge options).
- dotenv v17 prints a banner onto stdout → silenced (`quiet: true`); structured-logs-only stdout is a stated observability stance.

### Technical debt introduced (accepted, tracked)

- Integration tests require a reachable Postgres (compose locally, service container in CI); a Docker-less `pnpm verify` fails at the test leg — accepted, real-database testing is the fixtures-over-mocks rule applied.
- `docs/architecture/` placeholder still pending (fill from real code by M2).
- C2 (commitlint job installs full workspace) unchanged.

### Interview topics covered by this milestone

Webhook ingestion at scale (ACK-fast, at-least-once, idempotency keys, out-of-order tolerance), HMAC verification mechanics (raw bytes, constant-time compare, verify-before-parse), GitHub App vs OAuth App security models, raw-first/event-sourcing-lite storage, honest-CI-gate activation. Details: [project-memory/interview-notes.md](project-memory/interview-notes.md) §1–2.

### Status & next

- **Milestone 1: complete and locally verified; awaiting founder review** + push/PR (CI on GitHub) + GitHub App creation (manual, guided) + real-GitHub delivery check.
- **Next milestone:** M2 — artifact pipeline (BullMQ queue, worker, installation-token client, JUnit parsing, normalized schema). Design step first, per milestone workflow.

---

_(Next entry: Milestone 2, appended when completed.)_
