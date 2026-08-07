# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-08-07 (v0.1.x Stage 1 complete with **no open clauses** — the live-feed criterion closed on real traffic after a root-cause hunt; T8 closeout committed on the stage branch in two founder-approved commits; push/PR/merge are founder actions). This update also retro-covers Stage 0 (2026-07-28/29), whose session missed its handoff update — Stage 0 and the Stage 1 sessions are recorded in [session-history](../project-memory/session-history.md).

## Current repository status (v0.1.x Stage 1 — 2026-08-07)

- **Branch `docs/v01x-stage1-validation`** (from `main`; note the 2026-08-01 authorship rewrite — hash mapping in the [observation log](../validation/observation-log.md)): **Stage 1 complete.** All 13 prediction rows dispositioned (12 confirmed, H8 `not-observable`), both founder gate rows ✅ in the [release checklist](v0.1.0-release-checklist.md), [validation-report.md](../validation/validation-report.md) written.
- **T8 closeout committed in two founder-approved commits** (`fix(demo)`: the seeder attach assert; `docs(validation)`: everything else): observation-log entries (T6 close through the 2026-08-07 live-feed closure), prediction flips, checklist gate rows + dated updates, validation report, guide §3b dev-browser/claim rules incl. the repository-selection caution, demo README timing/tenancy notes, stage1-plan stale-hash repair, dev-log Stage 1 entry, session-history entries, this handoff.
- **Nothing was left open at commit time.** Exit criterion 3 closed 2026-08-07: live feed observed on real traffic (run row 31; publisher counters 1/1/1) after the root cause of four false negatives was found — the T7 claim-Save had silently removed `devflow-demo-flaky` from the installation (log, 2026-08-07 entries; guide §3b now carries the caution). Placeholders are filled; `pnpm verify` green and `pnpm e2e` 21/21 re-ran after the seeder change (exit criterion 5 ✅, 2026-08-06).
- **Dev DB state (this machine):** workspace "Ana" (id 2) owns both installations — real 150087152 and demo 770001; `quarantine_records` row 1 `active`; 18/18 runs `succeeded` (incl. the 2026-08-07 live-feed run, row 31). An accidental junk workspace was removed 2026-08-06 (see the mis-attachment log entry).

## Previous status — M6 close (2026-07-20, kept for context)

- **Branch `feat/self-host-release`** (from `main` = `6e8162b` / PR #10): **Milestone 6 complete.** All engineering components implemented, committed, and — as of this session — **the full pre-tag gate has passed** ([release checklist](v0.1.0-release-checklist.md) step 0):
  - `pnpm verify` green: 203 tests (queue 3, db 16, ai 21, worker 69, api 94). This closes the R4 partial-gate exception recorded on 2026-07-19.
  - `pnpm e2e`: **21/21**.
  - **The stranger test: passed** — fresh clone in a scratch directory, [self-hosting.md](../self-hosting.md) followed literally with throwaway credentials → full profile healthy on first boot (migrate exit 0, SPA served, healthz ok) → `pnpm install && pnpm build && pnpm demo:seed` → 6/6 checks, database populated per the storyboard (12 runs, 51 results, 2 repos, 4 embeddings, flaky 0.529 / suspected 0.464 / always-red 0).
- **The stranger test caught one real defect, fixed as `4401817`** (`fix(repo): fail fast when the seed or e2e harness runs unbuilt`): the seeder/e2e spawn apps from source, whose workspace imports resolve through package exports to compiled `dist/` — a clone with only `pnpm install` died with an opaque module-not-found. `assertBuilt()` now preflights (negative-tested: clear "run `pnpm build` first" error); demo/e2e docs and the checklist state the build prerequisite.
- **All milestone documentation is written and on the branch**: development-log M6 entry, session-history, release checklist (stranger row now ✅ with evidence), this handoff. Nothing is deferred post-merge.
- Known cosmetic non-issue: the e2e teardown prints a crash dump from the spawned apps after all checks pass (the throwaway `devflow_e2e` is force-dropped before the children are SIGKILLed). Benign, confined to teardown, left alone deliberately.

## What remains (all founder-gated, in order)

1. **Push the branch; open the Stage 1 PR; merge** (gates pre-run: `pnpm verify` green, `pnpm e2e` 21/21; nothing else is open).
2. Per the checklist's Stage 1 closeout updates: create the **GitHub Release** from the CHANGELOG 0.1.0 section, record the **demo video** ([storyboard](../../scripts/demo/README.md)) — together with Stage 1 these are the portfolio-presentable milestone — then the Dependabot majors queue (D-M6-6) and the **Stage 2 soak** ([scope proposal](../validation/validation-report.md), §6, awaiting ratification).

## Docker: healed, root cause found (2026-07-20)

The two 2026-07-19 failures and the "Engine starting" hang were finally explained: **C: drive exhaustion starved the WSL2 sparse VHDX** (kmsg: `Buffer I/O error … lost sync page write`), and everything else — SIGBUS, ext4 errors, image-store corruption — was downstream. After the founder freed ~124 GB, ext4 journal recovery completed cleanly; the remaining hang was only a stale Windows-side `com.docker.backend.exe` surviving `wsl --shutdown` (kill the Docker processes, relaunch — boots in seconds). No reset or purge was needed; images and volumes survived. Ops rules going forward: **watch C: free space; when storage misbehaves, check capacity before integrity; after `wsl --shutdown`, sweep Docker's Windows-side processes.**

## Dev environment state (M6 close, 2026-07-20 — historical; current DB state is in the Stage 1 status above)

- Dev infra up on **fresh volumes** (the old ones were removed for a clean stranger run; a pg_dump backup of the previous dev DB was taken first — session scratchpad, `devflow-dev-backup-2026-07-20.sql`). DB migrated (0000–0004) and seeded 6/6.
- **The seeded demo data is currently unclaimed**: the founder's workspace lived in the old volume. Designed path: log in once (`pnpm dev`, GitHub login), then re-run `pnpm demo:seed` — it attaches the demo installation to the workspace (the seeder prints exactly this instruction). Alternative: restore the pg_dump backup.
- Machine-only leftovers, harmless: pgvector `pg17` is a local retag of `0.8.0-pg17`; standalone compose v5.3.1 at `~/.docker/cli-plugins/docker-compose` (shadows the Desktop plugin; delete to fall back); stale 2025 containerd leases.
- The stranger clone and stack were torn down (`down -v`); nothing of it persists except the disposable clone in the session scratchpad.

## Known technical debt (accepted, tracked)

Unchanged from the M5 list plus the M6 additions recorded in CHANGELOG "Known limitations" (single-member workspaces; JUnit-only; GitHub-only; reactive rate limits; no backfill — D-M6-1 moved it post-MVP; unauthenticated `/metrics` posture; no automated UI tests). Machine-only: pgvector retag; user-scoped compose.

## Environment notes (this machine)

- WSL2; repo on `/mnt/d` (drvfs, slow); poll-never-sleep-once; port preflights; detached process groups for spawned apps.
- pnpm shim `~/.local/bin/pnpm`; Node 20.19.4 host; no `jq`/`gh`; **push/PR/merge/tag are founder actions**.
- GitHub username `annacrisstina`; founder communicates in Romanian; repository entirely in English.

## Things to remember before continuing

- Milestone workflow + NEVER list; verify-gated commits (no open exceptions — the R4 one is closed); no AI-attribution trailers; docs land on the branch before the PR (done for M6).
- D11 (merge policy) is founder-ruled: unchanged during M6 (D-M6-7).
- The seed data in the dev DB is demo state, not junk — the dashboard demo and storyboard depend on it; `pnpm demo:seed` regenerates it idempotently (after one founder login, it attaches — see above).
