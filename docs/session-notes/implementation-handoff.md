# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-07-20 (M6 complete — full pre-tag gate green; branch awaiting founder push/PR)

## Current repository status

- **Branch `feat/self-host-release`** (from `main` = `6e8162b` / PR #10): **Milestone 6 complete.** All engineering components implemented, committed, and — as of this session — **the full pre-tag gate has passed** ([release checklist](v0.1.0-release-checklist.md) step 0):
  - `pnpm verify` green: 203 tests (queue 3, db 16, ai 21, worker 69, api 94). This closes the R4 partial-gate exception recorded on 2026-07-19.
  - `pnpm e2e`: **21/21**.
  - **The stranger test: passed** — fresh clone in a scratch directory, [self-hosting.md](../self-hosting.md) followed literally with throwaway credentials → full profile healthy on first boot (migrate exit 0, SPA served, healthz ok) → `pnpm install && pnpm build && pnpm demo:seed` → 6/6 checks, database populated per the storyboard (12 runs, 51 results, 2 repos, 4 embeddings, flaky 0.529 / suspected 0.464 / always-red 0).
- **The stranger test caught one real defect, fixed as `4401817`** (`fix(repo): fail fast when the seed or e2e harness runs unbuilt`): the seeder/e2e spawn apps from source, whose workspace imports resolve through package exports to compiled `dist/` — a clone with only `pnpm install` died with an opaque module-not-found. `assertBuilt()` now preflights (negative-tested: clear "run `pnpm build` first" error); demo/e2e docs and the checklist state the build prerequisite.
- **All milestone documentation is written and on the branch**: development-log M6 entry, session-history, release checklist (stranger row now ✅ with evidence), this handoff. Nothing is deferred post-merge.
- Known cosmetic non-issue: the e2e teardown prints a crash dump from the spawned apps after all checks pass (the throwaway `devflow_e2e` is force-dropped before the children are SIGKILLed). Benign, confined to teardown, left alone deliberately.

## What remains for v0.1.0 (all founder-gated)

1. Review the M6 commits; **push the branch; open the PR** (suggested title: `feat(repo): production hardening and v0.1.0 release preparation`). The pre-tag gate is done; re-running any leg is optional reassurance.
2. After merge, per the checklist: tag `v0.1.0`, GitHub Release from the CHANGELOG, real-GitHub pass (App §3b, dogfood install on this repo + `devflow-demo-flaky` from the template), demo video ([storyboard](../../scripts/demo/README.md)), then the Dependabot majors (D-M6-6).

## Docker: healed, root cause found (2026-07-20)

The two 2026-07-19 failures and the "Engine starting" hang were finally explained: **C: drive exhaustion starved the WSL2 sparse VHDX** (kmsg: `Buffer I/O error … lost sync page write`), and everything else — SIGBUS, ext4 errors, image-store corruption — was downstream. After the founder freed ~124 GB, ext4 journal recovery completed cleanly; the remaining hang was only a stale Windows-side `com.docker.backend.exe` surviving `wsl --shutdown` (kill the Docker processes, relaunch — boots in seconds). No reset or purge was needed; images and volumes survived. Ops rules going forward: **watch C: free space; when storage misbehaves, check capacity before integrity; after `wsl --shutdown`, sweep Docker's Windows-side processes.**

## Dev environment state (this machine, end of session)

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
