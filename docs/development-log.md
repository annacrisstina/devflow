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
- _Post-merge addendum: merged to `main` in PR #6 (merge commit); first GitHub CI run green — the M0 review's withheld confidence closed._

---

## Milestone 2 — Artifact pipeline: queue + worker + JUnit parsing

- **Date:** 2026-07-18
- **Milestone:** 2
- **Goal:** from `workflow_run.completed` webhook to normalized test results in Postgres. Founder-trimmed to minimum required complexity: queue infrastructure, worker, GitHub API integration, artifact download, JUnit parsing, persistence — no optional optimizations.

### Completed work

- `@devflow/queue`: the api↔worker contract (queue name, `process-workflow-run` payload, connection factory, enqueue helper carrying the retry policy — 5 attempts, exponential backoff). Payloads reference `webhook_events.id`; the queue is dispatch, never storage.
- API producer: `workflow_run/completed` deliveries enqueue after raw persist — on the duplicate path too, so GitHub redelivery doubles as the repair mechanism for jobs lost after persist; `jobId = evt-<eventId>` collapses duplicates while queued.
- `@devflow/db`: `repositories`, `workflow_runs` (unique `(github_run_id, run_attempt)` — attempts are separate rows, M3's divergence signal), `run_artifacts` (per-artifact diagnostics), `test_results` (no unique constraint — parameterized tests; replace-per-run idempotency). Migration 0001.
- `@devflow/worker`: BullMQ consumer with bounded concurrency and graceful shutdown; pipeline = load-event → normalize-run (convergent upserts) → artifact stage (list → download → scan → persist); `PermanentJobError` marks the run failed and completes the job, everything else rethrows for backoff retry; BullMQ's failed set is the DLQ.
- GitHub client (in-worker, ~250 lines): hand-rolled RS256 app JWT on `node:crypto` (accepts GitHub's PKCS#1 PEM), per-installation token cache storing promises (single-flight), 404/410→permanent vs everything-else→transient classification, bounded pagination, streamed zip download. `baseUrl`/`fetchImpl` injectable for tests and stubs.
- JUnit streaming parser (saxes): testsuites/testsuite/testcase with nesting, failure/error/skipped, CDATA, attribute tolerance, 16KB/64KB truncation caps, root-element validation (non-JUnit XML skipped, counted). Zip scan via yauzl with per-entry uncompressed-size cap (zip-bomb guard). Fixture corpus: jest-junit, pytest, Surefire, nested suites, parameterized duplicates, not-junit, malformed.
- Correlation: the delivery GUID rides the job payload and binds every worker log line — one grep follows a delivery from API ACK to result rows.
- CI: Redis 7 service container joined Postgres; `DEVFLOW_REDIS_URL` through Turbo strict env.

### Verification (all run, not asserted)

51 automated tests green across 4 packages (queue behavior against real Redis; schema semantics and replace-per-run against real Postgres; parser fixtures; MockAgent'd GitHub client; full artifact-stage pipeline on a real zip). Full `pnpm verify` green. **Live local end-to-end:** real API + Redis + worker + Postgres with a stub GitHub API serving a fixture-built zip — signed webhook → 202 → job → normalize → download → parse → 8 result rows (6 passed / 1 failed / 1 skipped, matching the fixtures exactly) with `processing_status = succeeded` and artifact diagnostics; redelivered GUID → 200 duplicate, rows converged (1 run, 8 results).

### ADRs created

- ADR-0007: BullMQ on Redis (rejected: Kafka, pg-boss/SKIP LOCKED — respectable, RabbitMQ, no-queue).
- ADR-0008: Normalized test-results data model (attempts-as-rows; replace-per-run; installation as tenancy root until M4 — founder-approved deviation from "tenancy ADR in M2"; partitioning deferred with explicit trigger conditions).
- ADR-0009: In-house GitHub App client over Octokit (the auth dance is named interview material; PKCS#1 gotcha recorded).

### Lessons learned

1. **pnpm strictness paid out:** the worker importing `ioredis` types transitively failed typecheck — the exact phantom-dependency class M0's tooling was chosen to catch. Fixed by exporting the type from the package that owns the dependency.
2. **GitHub App keys are PKCS#1** ("BEGIN RSA PRIVATE KEY") — pure-JS JWT libraries that only import PKCS#8 refuse them; `node:crypto.createPrivateKey` accepts both. Discovered by writing the JWT by hand, which was the point of writing it by hand.
3. **Chaining verification and commit with `;` committed a red state once** — verify must gate the commit (`&&`), not precede it decoratively. The commit was amended after fixing lint; the discipline note stands.
4. **`<testsuites name>` is report metadata, not a suite** — asserting expectations against real fixture files (not imagined shapes) caught the wrong assumption in the test, not in production.

### Problems encountered

- Node's global fetch ignores npm-undici's `setGlobalDispatcher` — MockAgent testing requires injecting `fetchImpl`; recorded in the client design.
- A stale M1-era server holding port 3001 disrupted one e2e attempt (same lesson as M1: check port ownership).

### Technical debt introduced (accepted, tracked)

- Rate-limit handling is reactive-only (backoff on 403/429), no proactive header tracking — founder-directed minimalism, recorded in ADR-0009.
- Artifact pagination bounded at 10×100 per run; oversized/expired artifacts skipped with reasons — visible in `run_artifacts`, not silent.
- Worker has no health endpoint (logs + queue behavior only) — revisit in M6 compose hardening.

### Interview topics covered by this milestone

Queue design (dispatch-vs-store, at-least-once + DB-level idempotency, DLQ, why not Kafka), GitHub App token dance implemented by hand (JWT claims, clock drift, single-flight caching, PKCS#1), streaming parsing under memory caps, replace-per-run idempotency vs unique constraints, failure taxonomy (permanent vs transient) as the retry policy. Details: [project-memory/interview-notes.md](project-memory/interview-notes.md) §2–3.

### Status & next

- **Milestone 2: complete and locally verified end-to-end; awaiting founder review.** Real-GitHub verification (App + private key + workflow with a JUnit artifact) is a founder step documented in [github-app-setup.md](github-app-setup.md).
- **Next milestone:** M3 — flakiness detection engine + PR annotation (the killer feature; the detection-algorithm ADR is the most important of the project). Design step first.
- _Post-merge addendum: merged to `main` in PR #7 (merge commit, six commits preserved; `Co-Authored-By` trailers stripped pre-push at the founder's direction). CI on `main` green including the first run of the Postgres + Redis service containers — verified via the checks API, closing the "unproven on GitHub runners" caveat._

---

## Milestone 3 — Flakiness detection engine + PR annotation

- **Date:** 2026-07-18
- **Milestone:** 3
- **Goal:** the killer feature — from persisted test results to a deterministic flakiness verdict, delivered into the PR as an advisory check: "this failure is a known flake, not you."

### Completed work

- **ADR-0010 (the most important ADR of the project):** deterministic two-signal evidence model. Same-commit divergence (weight 1.0 — the code didn't change, the outcome did) + default-branch cross-commit transitions (weight 0.25 — weak evidence until file-relatedness lands post-MVP). Exponential decay (half-life 14d), saturating score `e/(e+K)`, verdicts flaky ≥ 0.5 / suspected ≥ 0.25. Structural properties, unit-tested verbatim: an always-failing test scores **zero** (broken ≠ flaky); absence in a partial re-run is **not** a pass; cold start produces no verdicts.
- `detection/score.ts`: pure scoring function (history in, assessment out — all I/O elsewhere); 12 unit tests pinning the ADR's reference arithmetic.
- `detection/detection-stage.ts`: event-driven incremental recompute after each run's results persist. Recompute set = (identities failing in this run) ∪ (identities in this run holding a non-healthy score) — the first raises scores, the second decays recovered tests back. Bounded 90-day history read; worst-status-per-run aggregation for parameterized repeats; upsert into `test_flake_scores` (evidence counts stored so every verdict is explainable without recomputation).
- `packages/db` migration 0002: `test_flake_scores` (unique per identity, repo+verdict index for the M4 dashboard shape), `repositories.default_branch` (the transition gate; a payload omitting it never clobbers a known value), `workflow_runs.flake_check_run_id` (annotation idempotency).
- **ADR-0011 + annotation stage:** advisory check run (`DevFlow flake report`) on the run's head sha — always `neutral` (structurally unable to block a merge), silent when no failing test carries a non-healthy verdict, POST-once/PATCH-thereafter via `flake_check_run_id`, PATCH-to-all-clear when a reprocess stops flagging. Summary decomposes evidence in plain language ("1 same-commit pass/fail divergence"), capped at 20 tests with stated overflow.
- GitHub client grew `createCheckRun`/`updateCheckRun` (same taxonomy: 404/410 permanent, else transient); **Checks: write** permission documented in github-app-setup.md including the re-approval path for pre-M3 Apps.
- Worker config: `DEVFLOW_FLAKE_*` knobs (half-life, saturation K, both thresholds) with boot-time validation including the cross-field suspect < flaky constraint; defaults deliberately under-flag.
- Pipeline wiring: artifact stage now reports `succeeded | no_artifacts`; detection runs only when results persisted; annotation failures never mark ingestion failed (results and scores are already durable).

### Verification (all run, not asserted)

72 automated tests green across the workspace (was 51): detection scoring units, detection-stage integration on real Postgres (divergence scoring, decay-to-healthy, parameterized aggregation, convergent recompute, silence for untracked passing tests), annotation-stage integration (create/PATCH/all-clear/silence), check-run client tests, default-branch capture. Full `pnpm verify` green. **Live local e2e:** real API + worker + Postgres + Redis + stub GitHub API — three signed deliveries building a same-commit divergence (fail@sha-A → pass@sha-A → fail@sha-B) produced score 0.3323 / verdict `suspected` / 1 divergence + 0 transitions (matching the ADR arithmetic exactly) and one neutral check run titled "1 suspected-flaky among 1 failing test" with the evidence table; `flake_check_run_id` persisted; redelivered GUID → 200 duplicate, state converged (one score row, one check).

### ADRs created

- ADR-0010: Flakiness detection algorithm (rejected: ML/statistical classifiers — D14 plus no training data at MVP scale; failure-rate thresholds — conflate broken with flaky; windowed counts — cliff effects; Bayesian — same arbitrariness, harder to narrate).
- ADR-0011: Advisory-only Checks API annotation (rejected: PR comments — noisy and blame-flavored; commit status — no rich output; failing/action_required conclusions — a scoring error must never become a workflow outage).

### Deviations (recorded for founder review)

- **Installation-time backfill (roadmap M3 scope) not implemented.** It needs its own design pass: listing historical workflow runs via the API, artifact expiry limiting how far back results exist, and rate-budget for a burst of backfill jobs. Detection works from the first ingested run and improves as dogfooding accumulates history; proposal is to treat backfill as a separate founder-scoped item (M3.5 or folded into M6 demo tooling) rather than rushing an undesigned burst-write path.
- Redelivery-of-a-completed-job does not reprocess while the completed job is retained (BullMQ jobId dedup, `removeOnComplete: {count: 1000}`) — existing documented M2 behavior, observed live in the e2e; noted here because the annotation PATCH path therefore triggers on genuine reprocessing (retry after transient failure), not on every redelivery.

### Lessons learned

1. **The recompute set is an annotation-semantics decision, not just an optimization:** a fail→pass re-run does not immediately raise a score (the pass holds no verdict yet) — the divergence is picked up at the identity's _next failure_, which is exactly when a verdict is needed. Understanding why that's correct required walking the annotation flow, not the scoring math.
2. **Raw SQL selections bypass drizzle's column mapping** — `sql<Date>` coalesce over two timestamp columns hands back a driver string, silently satisfying the type until `.getTime()` explodes. Integration tests on real Postgres caught it; unit tests never would have.
3. Editor/tooling note: writing `\u0000` escapes through generation tooling can emit literal NUL bytes into source; `cat -A` before trusting a "string constant".
4. **The stale-process lesson, third edition:** a leaked e2e worker (a `pkill` pattern that didn't match tsx's real argv — `cli.mjs src/main.ts`, not `tsx src/main.ts`) kept consuming the shared BullMQ queue with a dropped database, making an unrelated queue test fail via 15 s backoff retries — a genuinely flaky test, in the flaky-test-detection project. Verify process death from `ps` output, never from the absence of a pattern match; the fix restored the test from intermittent 20 s timeouts to a stable 375 ms.

### Technical debt introduced (accepted, tracked)

- Score upserts are per-identity inside a loop (fine at recompute-set sizes; batch if a pathological suite makes it hurt — measured first).
- Stale non-healthy scores persist until the identity reappears (harmless in M3 — verdicts only surface on new failures; M4 dashboard applies decay-at-read).
- A 403 from an unapproved Checks:write permission retries into the DLQ (indistinguishable from rate limiting by status alone) — accepted, documented in ADR-0011 and github-app-setup.md.

### Interview topics covered by this milestone

The detection model itself (evidence weighting, decay, saturation, false-positive asymmetry, why not ML — the project's core story), incremental recompute design, advisory-by-construction annotation (neutral conclusion as a structural guarantee), permission-growth UX of GitHub Apps. Details: [project-memory/interview-notes.md](project-memory/interview-notes.md) §4.

### Status & next

- **Milestone 3: complete, verified end-to-end locally; awaiting founder review + PR.** Branch `feat/flakiness-detection`; push/PR/merge are founder actions.
- Real-GitHub verification (App with Checks:write on a live repo) remains the standing founder step — now it also starts producing real annotations.
- **Next milestone:** M4 — dashboard + live feed + quarantine workflow (needs the workspace-tenancy and auth ADRs). Backfill decision pending (see deviations).
- _Post-merge addendum: merged to `main` in **PR #8** ("feat(worker): add flakiness detection", merge commit `dc3e41f` — third merge-commit-not-squash occurrence; the D11 branch-protection decision still stands open). CI on merged `main` green, verified via the public checks API. One CI incident on the branch: the commitlint job failed at the **Lint-PR-title step** (the quality job was green); the title was corrected and an empty `chore: rerun CI` commit re-triggered the check — a title edit alone does not re-run it. That commit now sits in `main` history via the merge. ADR-0010/0011 are approved as merged. Housekeeping done by the founder: all merged remote feature branches (M1–M3) deleted._

---

## Milestone 4 — Dashboard, live feed, quarantine workflow

- **Date:** 2026-07-19
- **Milestone:** 4
- **Goal:** the product becomes visible and daily-usable — GitHub login, workspace tenancy over the existing ingestion, the flakiest-tests ranking, a live run feed, and the propose→human-approve→track quarantine loop. First user-facing surface; the two long-deferred ADRs (tenancy D8, auth D3) land here.

### Completed work

- **Tenancy (ADR-0012):** migration 0003 — Auth.js tables (`users`/`accounts`/`sessions`/`verification_tokens`, text UUID ids per the adapter contract), `workspaces`, `workspace_members` (owner|member, unique pair), `installations` (unique GitHub id, **nullable workspace_id = unclaimed**, `uninstalled_at`), `quarantine_records` (partial unique index on active identities) — plus a hand-written backfill turning every pre-M4 `repositories.installation_id` into an unclaimed installation. Ingest write path untouched; tenancy resolves at read time via repository → installation → workspace. Isolation is application-layer (RLS deferred with a written trigger): session+membership preHandlers (404, no existence oracle) + a cross-tenant denial integration test on every endpoint.
- **Auth (ADR-0013, the milestone's risk spike, built first):** `@auth/core` mounted on Fastify with a ~40-line shim (the `@auth/express` pattern; no official Fastify binding exists), Drizzle adapter, **database sessions** (cookie value = revocable session row), the GitHub App's own OAuth credentials (no second OAuth App). API request auth is one indexed join on the session cookie. The pre-agreed fallback (hand-rolled OAuth flow) was not needed.
- **Public API (ADR-0014):** `/api/v1` — me, workspaces (create/detail/repositories), flaky-tests ranking + detail-with-history, runs (with test counts), quarantine, installation claiming. Conventions fixed now that the first endpoints exist: URL versioning, `{error:{code,message}}`, limit/offset+total on unbounded lists. **Decay-at-read closes M3's stale-score debt:** stored scores are unwound to evidence, decayed with the same half-life, re-saturated — computed **in SQL** so ranking order, verdict filters and pagination are consistent on the decayed value; TS reference implementation unit-pinned, SQL ≡ TS asserted by an integration test. New type-only `@devflow/contract` package shares DTOs and event shapes with the web app.
- **Installation claiming:** signed-state install link (HMAC over `{workspaceId,userId,exp}`) → GitHub's Setup URL redirect → claim bound to both the state and the live session; unclaimed/foreign/fresh-install cases all covered. `installation` webhook events flow through the existing raw-persist path into a second job type; the worker keeps `installations` in sync (uninstall marks, never deletes). `normalize-run` guarantees an installations row for every installation the pipeline ever sees.
- **Quarantine (ADR-0016):** proposals are a **query** (effective-verdict flaky, no active/dismissed record) — no automated writer of quarantine state exists; decisions are durable rows with who/when/why (approve→active, dismiss→suppressed-but-reversible, lift→history). The annotation stage labels failures of actively-quarantined tests ("human-approved quarantine") with the conclusion still hardcoded `neutral` — ADR-0011's advisory guarantee untouched.
- **Live feed (ADR-0015):** worker publishes `run.ingested`/`run.processed`/`scores.updated` envelopes (workspace resolved at publish time; unclaimed installations emit nothing) over Redis pub/sub on dedicated connections; the API's Socket.IO server authenticates handshakes with the session cookie and fans out to `ws:<id>` rooms. Explicitly best-effort: REST is the source of truth, events only trigger refetches — which keeps the roadmap's polling cut line a one-line degradation.
- **`apps/web`:** Vite + React (strict TS) + react-router + TanStack Query + Tailwind; same-origin behind the API (dev: Vite proxy; prod: `@fastify/static` behind `DEVFLOW_WEB_DIST` with SPA fallback). Views: login → workspace create/select → connect installation → repositories → flakiest ranking → test detail → live runs → quarantine tabs (Proposed/Active/Dismissed).

### Verification (all run, not asserted)

- **129 automated tests green across the workspace** (was 72): db tenancy/backfill/partial-index suites, auth mount + guards, v1 contract + cross-tenant denial per endpoint, decay arithmetic pinned to ADR-0010 reference numbers + SQL≡TS equality, claiming (signed state round-trip/tamper/expiry/theft-refusal), quarantine state machine, annotation labeling, live publisher + Socket.IO room isolation on real Redis. Full `pnpm verify` green (10 turbo tasks).
- **Scripted live e2e, 14/14 checks** (real API + worker + Postgres + Redis + stub GitHub API): claim link → signed-state setup callback binds the installation → six signed deliveries build divergences → score **0.3333/suspected** matching ADR-0010 exactly → neutral check "1 suspected-flaky among 1 failing test" → third divergence promotes to **flaky 0.6** → ranking/runs/history endpoints serve it → proposal appears → approve → next failure's check reads "**1 quarantined** among 1 failing test" with `human-approved quarantine` evidence, conclusion still neutral → 21 live socket events, all workspace-scoped → redelivery converges (one run row, no duplicate scores).
- Static serving verified live (SPA at `/`, client-route fallback, JSON 401/404 on API paths).

### ADRs created

- ADR-0012: Workspace multi-tenancy (rejected: RLS-now, tenancy-in-ingest-path, per-user tenancy, auto-created workspaces, org-membership claiming).
- ADR-0013: Auth.js on Fastify with database sessions (rejected: hand-rolled OAuth, JWT sessions, auth-in-web-app, managed IdPs, community wrappers).
- ADR-0014: Public API conventions + decay-at-read (rejected: header versioning, stored-verdict filtering, decay-in-TS-after-fetch, background recompute jobs, RFC 7807, codegen).
- ADR-0015: Live feed transport (rejected: Redis adapter now, LISTEN/NOTIFY, queue-as-transport, SSE/raw ws, durable replay).
- ADR-0016: Quarantine workflow (rejected: materialized proposals, quarantine-on-the-score-cache, auto-lift, mutable single row, CI-modifying quarantine).

### Deviations (recorded)

- **No workspace invites:** M4 ships single-member workspaces; the members/role schema makes teams additive, but an invite flow needs email or link infrastructure — deliberately post-MVP, stated in ADR-0012.
- **In-browser GitHub OAuth + live claim against real GitHub remain founder verification steps** (need the App's client secret and reconfiguration — steps documented in github-app-setup.md §3b). The e2e covers the same code paths with a scripted session and stub GitHub, per the M2/M3 stub-first precedent.
- Exactly two fresh divergences score marginally _below_ the 0.5 flaky threshold (`2d/(2d+2)`, d<1) — discovered writing the e2e; recorded as the under-flagging bias working as designed, not a bug.

### Lessons learned

1. **The e2e caught a real client bug the unit tests couldn't:** `fetch` with a JSON content-type and no body is a 400 in Fastify — the SPA's API wrapper and the e2e harness both had it. Contract tests exercise routes with inject(); only the full HTTP path exposed it.
2. **A poll that treats `rowCount: 0` as truthy waits for nothing** — the first e2e "passed" its waits instantly and produced impossible-looking state (scores vanishing, attempts out of order) that all traced to one falsy-check bug. Polls must check the value, not just non-undefined.
3. **The leaked-process lesson, fourth edition, now structural:** killing a `pnpm exec` child orphans the `tsx` grandchild (M3's exact incident). The e2e now spawns detached process groups, kills the group, and preflights its ports before starting.
4. **GitHub artifacts list per run, not per attempt** — a stub keyed by run id silently serves attempt 2's artifact for attempt 1's job. The e2e models divergence across runs on the same sha (which is also ADR-0010's actual definition).

### Technical debt introduced (accepted, tracked)

- Effective-score SQL appears in ORDER BY/WHERE per list request — fine at MVP scale; a computed/cached column is the recorded escape hatch (measure first).
- Socket rooms are joined at connect time; new memberships apply on reconnect (ADR-0015).
- Duplicate `dismissed` rows are possible under concurrent dismissal (no unique constraint; harmless history noise, ADR-0016).
- The web app has no automated UI tests (lowest MVP priority, stated in its README); `verify` covers typecheck+build, correctness lives in API contract tests.

### Interview topics covered by this milestone

Multi-tenancy design (claiming via signed state, unclaimed-data backfill, app-layer isolation vs RLS with a written trigger), mounting a framework-agnostic auth engine (Request/Response shims, database vs JWT sessions), read-model design (decay-at-read in SQL, cache-vs-derived-data honesty), human-in-the-loop workflow structure (proposals-as-queries), real-time fan-out (pub/sub topology, best-effort contracts, why not the Redis adapter yet). Details: [project-memory/interview-notes.md](project-memory/interview-notes.md) §10.

### Status & next

- **Milestone 4: complete, verified end-to-end locally; awaiting founder review + PR.** Branch `feat/web-dashboard` (includes the folded M3 closeout docs — `docs/m3-post-merge-closeout` can be deleted unmerged); push/PR/merge are founder actions.
- Founder steps before/at merge: D11 squash decision (three merge commits and counting), GitHub App reconfiguration (§3b: OAuth callback + client secret, Setup URL, `installation` events), then a real-GitHub login + claim + dogfood pass.
- **Next milestone:** M5 — AI layer (assistive only) + semantic search (AI-boundary ADR due), or M6 first if the founder prefers hardening before AI. Backfill decision still open (M6 recommended).

---

## Milestone 5 — AI layer (assistive only) + semantic search

- **Date:** 2026-07-19
- **Milestone:** 5
- **Goal:** disciplined AI on top of a complete product — semantic search over failure history, failure clustering, and human-triggered root-cause hypotheses; everything advisory, everything amputable (D14 made mechanical), self-hosting intact.

### Completed work

- **The self-hosting split (the milestone's central decision):** search + clustering run on a **local embedding model** — no key, no managed dependency; hypotheses use a **BYO-key LLM** — absent key means the feature is cleanly off (`501 ai_disabled`, UI hides it via `/me` features). NEVER-#11 honored structurally, not by exception.
- **`@devflow/ai` (ADR-0017):** the amputable layer as a package with enumerated call sites and a grep-verifiable deletion test. Contains the MiniLM embedder (quantized ONNX via `@huggingface/transformers`, 384 dims, lazy singleton), canonical failure-text normalization + sha256 content hashing, greedy single-link clustering over Float32Arrays, and the plain-fetch Anthropic provider (injectable `fetchImpl`/`baseUrl`, the ADR-0009 pattern).
- **Founder gate, measured (component 1 spike):** ~25 MB one-time model download, ~0.4 s warm load, ~150 MB RSS, **2–6 ms per short text** on the WSL2 dev machine; paraphrases 0.79–0.82 cosine vs 0.22–0.23 unrelated. Gate passed decisively; the API-embeddings fallback was never needed. Bonus recorded: `onnxruntime-node` ships prebuilt binaries — pnpm 10's lifecycle-script blocking (D13) stays fully intact.
- **Migration 0004 + write path (ADR-0018):** `CREATE EXTENSION vector` (the image has shipped it since M0 — D5 finally cashed in), `test_results.failure_hash` (partial index), content-addressed `failure_embeddings` (unique per repo+hash — a message repeated ten thousand times embeds once), `ai_hypotheses` (identity copied, not FK'd — ADR-0016's reasoning). The worker's embedding stage runs after detection: stamps hashes, embeds only unseen texts (bounded per run, overflow stated), flag-gated, and failure-isolated like the live feed — it can never fail or retry ingestion. Convergent under replace-per-run reprocessing.
- **Read surface (ADR-0018):** `GET /search?q=` (embed query → exact cosine top-K in pgvector, workspace-scoped, joined to occurrences + affected tests; HNSW trigger recorded at ~100k vectors) and `GET /repositories/:id/failure-clusters?days=` (windowed, capped, computed per request — geometry, nothing stored). `/api/v1/me` grew the `features` capability object.
- **Hypotheses (ADR-0019):** `POST /flaky-tests/:scoreId/hypothesis` — human-triggered only, evidence digested (`sha256(evidence+prompt_version)`), cache served on unchanged evidence, `force` and prompt-version bumps regenerate; provenance (answering model, prompt version, requester, timestamp) stored and displayed; upstream failures map to 502 without disturbing the cache. Prompt instructs the model to treat failure logs as untrusted data; output is one labeled advisory text sink. Default model `claude-haiku-4-5`, 800-token cap, temperature 0.2. Cost is structurally bounded: no loops exist to rate-limit.
- **Web:** Insights page (search + clusters with repo/window selectors) and the hypothesis panel on test detail ("AI-generated hypothesis — verify before acting" + provenance line) — both render only what the deployment's features enable.
- **CI:** model directory cached (`actions/cache`, SHA-pinned via the commits API — the M0 annotated-tag lesson applied again); embedder tests run the real model.

### Verification (all run, not asserted)

- **`pnpm verify` green: 158 tests** (was 129): `@devflow/ai` 21 (clustering pinned on synthetic vectors; embedder on the **real model** — normalized dims, paraphrase-over-unrelated margins; LLM client wire shape/error taxonomy on fake fetch), worker 71 (embedding stage: hash stamping, dedup, caps, reprocess convergence, swallow-on-failure), api 91 (search ranking/scoping, cluster grouping/windowing, hypothesis generate/cache/force/digest/502/501, features flags, cross-tenant denial on every new endpoint).
- **Scripted live e2e, 22/22** — the full M4 regression flow (claim → divergences → 0.3333 suspected → flaky 0.6 → quarantine → neutral "quarantined" check → live events → redelivery convergence) **plus**: worker embedded 3 distinct failure texts with hashes stamped; real-MiniLM search ranked both timeout paraphrases (0.72/0.69) above the redis failure (0.26); clusters split 2+1; hypothesis generated through the real client against a stub LLM (provenance `claude-haiku-4-5-e2e`, prompt carried the untrusted-data instruction and the real failure message; second call served the cache with zero LLM calls).

### ADRs created

- ADR-0017: The AI boundary, formalized (enumerated call sites + deletion test; two output sinks; human-trigger rule; prompt-injection posture).
- ADR-0018: Local embeddings, content-addressed storage, deterministic clustering (rejected: API embeddings, Ollama, bigger models, per-row embedding, ANN-now, k-means/LLM clustering).
- ADR-0019: LLM provider seam + hypotheses (rejected: SDK, multi-provider-now, streaming, background generation, hypothesis history).

### Deviations (recorded)

- **Live verification against the real Anthropic API is a founder step** (needs the founder's key) — everything else runs against the stub through the real client; same precedent as real-GitHub verification.
- The roadmap's original cut line ("M5 shrinks to summarization-only") was **consciously inverted at review time** (founder-ratified): local-first embeddings made search/clustering the cheap half, so the LLM half would have dropped first. No cut was needed.

### Lessons learned

1. **Measure before you argue:** the local-vs-API embeddings debate ended in one spike run — 2–6 ms per text on a laptop CPU closes the discussion in a way no benchmark table from the internet could.
2. **`onnxruntime-node` needs no lifecycle scripts** — prebuilt binaries load under pnpm 10's script blocking. Worth knowing before weakening a supply-chain posture "because native modules".
3. **Exactly-two-fresh-divergences scores a hair under the flaky threshold** (`2d/(2d+2)`, d<1) — surfaced again writing the e2e; it is the under-flagging bias behaving as specified, and the e2e now documents it with a third divergence pair.
4. **Content-address before you embed:** deduplicating by hash before inference turned the embedding stage from "per failure" to "per novel failure" — the difference between a real cost and a rounding error at CI scale.

### Technical debt introduced (accepted, tracked)

- Failure-text normalization is whitespace-only; near-identical messages differing in timestamps/addresses embed separately (recorded post-MVP improvement — changing it is a hash migration).
- Clustering is O(n²) at the 1000-vector window cap (sub-second measured; revisit only if a real window hits the cap).
- The API's query embedder loads the model in-process on first search (~0.4 s warm, one-time per process) — acceptable; a shared embedding service is the recorded escape hatch if multiple API instances ever matter.
- Air-gapped deploys must pre-seed `DEVFLOW_AI_MODEL_DIR` (documented; M6 owns the compose volume note).

### Interview topics covered by this milestone

Where NOT to use an LLM (clustering as geometry; detection untouched — the §5 story now implemented), amputable-architecture as a package boundary with a deletion test, local CPU inference trade-offs (model class selection, quantization, measured latency), content-addressed derived data, pgvector exact-vs-ANN reasoning, prompt-injection posture for log-fed LLMs, structural (not policy) cost bounding. Details: [project-memory/interview-notes.md](project-memory/interview-notes.md) §5.

### Status & next

- **Milestone 5: complete, verified end-to-end locally; awaiting founder review + PR.** Branch `feat/ai-insights`; push/PR/merge are founder actions.
- Founder steps: optional live-LLM pass with a real key; the standing real-GitHub verification (App reconfiguration from M4) still open.
- **Next milestone: M6 — production hardening + release** (one-command self-host, seed/demo tooling + the parked backfill decision, observability polish, docs/diagrams, demo video, v0.1.0). Design step first, on the founder's go.

---

## Milestone 6 — Production hardening + v0.1.0 release readiness

- **Date:** 2026-07-20
- **Milestone:** 6
- **Goal:** close the distance between "the product works on the dev machine" and the roadmap's release gate — "a stranger can run this and see it work": observability, one-command containerized self-hosting, demo/seed tooling, dogfooding, final docs, and the v0.1.0 release artifacts.

### Completed work

- **Observability (ADR-0021):** `/healthz` + Prometheus `/metrics` on both processes (the worker grew its own health server); the alertable number is the dead-letter gauge `devflow_queue_jobs{state="failed"}`; metric names declared API surface.
- **E2e harness promoted into the repo** (`pnpm e2e`): the scripted live end-to-end (claim → ADR-0010 arithmetic → annotation → quarantine → embeddings → search → clusters → hypothesis → live feed → redelivery convergence) became a first-class verification tool with port preflights and stubbed GitHub/LLM APIs.
- **Containerized self-hosting (ADR-0020):** one compose file, two modes — dev infra only vs `--profile full` (one-shot `migrate` gating api/worker, dashboard + embedding model baked into the images, loopback publishing, throwaway-cred-friendly boot validation); `docs/self-hosting.md` is the stranger-facing guide.
- **R1 — demo seeder + flaky-repo template (D-M6-2/3):** `pnpm demo:seed` replays a curated 12-run history through the real pipeline (signed deliveries, deterministic GUIDs, locality guard) — flaky ~0.529 / suspected ~0.464 / always-red scoring zero, four distinct failure texts for search/clusters; the template repo ships for the founder's live `devflow-demo-flaky`.
- **R2 — dogfooding:** all five vitest packages emit JUnit XML; CI uploads it with SHA-pinned `upload-artifact` under `if: always()` — DevFlow's own parser verified against vitest's dialect directly.
- **R3 — docs pass:** README (self-hosting, how-it-works), architecture overview (deployment + observability views, refreshed mermaid).
- **R4 — release artifacts (D-M6-5):** CHANGELOG 0.1.0 with honest known limitations, version 0.1.0, the clause-by-clause release checklist, the demo-video storyboard. Backfill formally cut to post-MVP (D-M6-1); Dependabot majors deferred until after the tag (D-M6-6).
- **Gate-day fix (`4401817`):** the stranger test caught that `pnpm demo:seed`/`pnpm e2e` die with an opaque module-not-found on a clone that ran `pnpm install` but not `pnpm build` — the spawned apps' workspace imports resolve to each package's compiled `dist/`. `assertBuilt()` now preflights every package and names the fix; the demo/e2e docs and checklist state the build prerequisite.

### Verification (all run on 2026-07-20, after healing Docker)

- **`pnpm verify` green:** 203 tests (queue 3, db 16, ai 21, worker 69, api 94) — closing the one recorded exception (R4's commit had run only the four Docker-free legs).
- **`pnpm e2e`: 21/21**, re-run after the harness fix.
- **The stranger test — passed, and it earned its keep:** fresh clone in a scratch directory, `docs/self-hosting.md` followed literally with throwaway credentials → full profile healthy on first boot (migrate exit 0, SPA served, healthz ok) → `pnpm install && pnpm build && pnpm demo:seed` → 6/6 checks, database populated exactly per the storyboard (12 runs, 51 results, 2 repos, 4 embeddings, correct verdicts). First attempt surfaced the missing-build defect above; fixed, negative-tested (clear fail-fast message), re-run clean.

### ADRs created

- ADR-0020: Containerized self-hosting (two compose modes, migrate-gated startup, baked model).
- ADR-0021: Observability — health endpoints and Prometheus metrics as API surface.

### Deviations (recorded)

- The stranger clone came from the local repository, not GitHub — the branch is unpushed (push/PR are founder actions). Same-content verification; the literal-URL clone happens implicitly at the founder's real-GitHub pass.
- The dashboard click-through on seeded data remains a founder step: login requires the real GitHub App. The seeder's unclaimed-data path (seed → log in once → re-seed attaches) is the verified stranger behavior.
- This milestone absorbed two Docker Desktop failures (2026-07-19) and a recovery session (2026-07-20); root cause was found to be **C-drive exhaustion starving the WSL2 VHDX** — the corruption was a symptom. Details in session-history; the ops lesson is recorded there rather than in product docs.

### Lessons learned

1. **The stranger test finds what the dev tree structurally cannot:** every developer machine has `dist/` built, so the packages' exports-to-dist resolution had never once been exercised from a bare install. "Works where it was written" is not "works from install."
2. **Preflights should name the fix:** `assertBuilt()` joining `assertPortsFree()` turns a cryptic healthz timeout plus a stack dump into a one-line instruction. Guards that only detect are half a guard.
3. **Diagnose the substrate before the artifact:** two days were spent on image-store corruption and service forensics; the actual disease was a full host disk. When storage misbehaves, check capacity before integrity.

### Technical debt introduced (accepted, tracked)

Unchanged from M5 plus the CHANGELOG "Known limitations" list (single-member workspaces; JUnit-only; GitHub-only; reactive rate limits; no backfill; unauthenticated `/metrics` posture; no automated UI tests). Machine-only, not repo debt: the pgvector `pg17` local retag and the user-scoped compose v5.3.1 from the Docker recoveries.

### Status & next

- **Milestone 6: complete — the full pre-tag gate is green.** Branch `feat/self-host-release`; push, PR (suggested title: `feat(repo): production hardening and v0.1.0 release preparation`), and merge are founder actions.
- After merge, per the release checklist: tag `v0.1.0`, GitHub Release from the CHANGELOG, the real-GitHub pass (App §3b, dogfood install, `devflow-demo-flaky` from the template), demo video, then the Dependabot majors queue (D-M6-6).

---

_(Next entry: post-v0.1.0 work, appended when a milestone completes.)_
