# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-07-19 (M6 engineering scope complete on `feat/self-host-release`; final verification gate blocked by a second Docker failure — see below)

## Current repository status

- **Branch `feat/self-host-release`** (from `main` = `6e8162b` / PR #10): **all Milestone 6 engineering components implemented and committed**, per the founder-approved [remaining-scope review](m6-remaining-scope-review.md) (decisions D-M6-1…7 recorded in [engineering-decisions.md](../project-memory/engineering-decisions.md)):
  1. Observability — ADR-0021 (`673aaeb`).
  2. E2e harness promotion (`01777ad`).
  3. Containerized self-hosting — ADR-0020 (`39df197`).
  4. **R1** demo seeder + flaky-repo template (`b864a39`) — verified live: 6/6 checks, scores match ADR-0010 arithmetic (0.529 flaky / 0.464 suspected / always-red 0), re-runs converge.
  5. **R2** dogfood CI wiring (`9c6a150`) — verified: all five packages emit JUnit XML; **DevFlow's own parser parses vitest's output** (checked directly); `if: always()` upload step SHA-pinned (`upload-artifact` v7.0.1).
  6. **R3** README + architecture overview M6 pass (`9855120`).
  7. **R4** release artifacts (`efc4efc`): CHANGELOG 0.1.0 + known limitations, version 0.1.0, [release checklist](v0.1.0-release-checklist.md), demo storyboard (`scripts/demo/README.md`).
- **⚠️ R4's commit ran only 4 of 5 verify legs** (format/lint/typecheck/build green; the test leg needs Postgres+Redis and Docker was down — see below). The diff is docs + the version field; the last full `pnpm verify` (R2, all 158+ tests) and `pnpm e2e` (21/21, same day) are the standing evidence. **Re-run `pnpm verify` before the PR.**
- **⚠️ The stranger test is pending** (fresh clone → self-hosting guide literally → seeded dashboard). It was mid-flight when Docker failed; the release checklist gates the tag on it (step 0).

## The second Docker failure (2026-07-19 evening, this machine)

During the stranger test, `docker compose` died with SIGBUS (the plugin binary's backing cross-distro mount broke), then the engine went down entirely. Diagnosis trail: the `docker-desktop` WSL distro stopped; after restarting Docker Desktop, the backend loops on "backend server is already running"; root cause found — **the privileged Windows service `com.docker.service` is STOPPED**, and starting it needs elevation (`net start com.docker.service` → Access denied from WSL).

**Founder fix (pick one):** run an elevated PowerShell → `net start com.docker.service`, then start Docker Desktop; or simply reboot Windows (the service is likely Automatic). Then: `docker compose up -d`, re-apply nothing (data intact in volumes as of the last healthy state), and run the pre-tag gate (checklist step 0).

Machine-state notes from the recovery work:

- **Standalone compose v5.3.1 installed at `~/.docker/cli-plugins/docker-compose`** — it shadows Docker Desktop's plugin (which broke via the `/mnt/wsl/docker-desktop` share). Harmless to keep; delete to fall back.
- The morning crash's leftovers stand: pgvector `pg17` is a **local retag of `0.8.0-pg17`** (corrupt-chain workaround), dev DB was re-migrated fresh and now carries the seed data, stale 2025 containerd leases remain. If image corruption symptoms return, Docker Desktop → Troubleshoot → Purge data is the clean reset (nothing precious in it).
- A fresh clone for the stranger test may remain at the session scratchpad (`…/scratchpad/stranger/`) — disposable.

## What remains for v0.1.0 (all founder-gated)

1. **Heal Docker** (above), then the **pre-tag gate**: `pnpm verify` + `pnpm e2e` + the stranger test ([checklist](v0.1.0-release-checklist.md) step 0).
2. Review the M6 commits; push branch; open the PR (suggested title: `feat(repo): production hardening and v0.1.0 release preparation`).
3. After merge: tag `v0.1.0`, GitHub Release from the CHANGELOG, real-GitHub pass (App §3b, dogfood install on this repo + `devflow-demo-flaky` from the template), demo video ([storyboard](../../scripts/demo/README.md)), then the Dependabot majors (D-M6-6).
4. **The development-log M6 entry is deliberately not written yet** — the log records completed milestones, and M6 completes when the gate passes; write it on the same branch before the PR, or (if the founder prefers) note it as the one intentional post-merge doc.

## Known technical debt (accepted, tracked)

Unchanged from the M5 list plus the M6 additions recorded in CHANGELOG "Known limitations" (single-member workspaces; JUnit-only; GitHub-only; reactive rate limits; no backfill — D-M6-1 moved it post-MVP; unauthenticated `/metrics` posture; no automated UI tests). Machine-only: pgvector 0.8.0 retag; user-scoped compose v5.3.1.

## Environment notes (this machine)

- WSL2; repo on `/mnt/d` (drvfs, slow); poll-never-sleep-once; port preflights; detached process groups for spawned apps.
- pnpm shim `~/.local/bin/pnpm`; Node 20.19.4 host; no `jq`/`gh`; **push/PR/merge/tag are founder actions**.
- GitHub username `annacrisstina`; founder communicates in Romanian; repository entirely in English.
- **Docker Desktop on this machine has now failed twice today** (storage corruption in the morning; service/backend death in the evening). Treat `docker ps` succeeding as necessary but not sufficient — stat a binary inside an image before trusting old layers, and check `sc.exe query com.docker.service` when the engine won't boot.

## Things to remember before continuing

- Milestone workflow + NEVER list; verify-gated commits (the R4 partial gate is the one recorded exception — close it before the PR); no AI-attribution trailers; docs land on the branch before the PR.
- D11 (merge policy) is founder-ruled: unchanged during M6 (D-M6-7).
- The seed data in the dev DB is demo state, not junk — the dashboard demo and storyboard depend on it; `pnpm demo:seed` regenerates it idempotently.
