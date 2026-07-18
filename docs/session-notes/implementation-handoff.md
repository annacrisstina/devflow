# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-07-18 (M3 implementation complete on `feat/flakiness-detection`)

## Current repository status

- **Branch `feat/flakiness-detection`** carries the complete Milestone 3 implementation as six logically separated commits (sequence below). `main` is at `2acbc95` (M2 post-merge closeout docs), in sync with origin.
- **Next concrete step: founder pushes the branch and opens the PR.** Push/PR/merge are founder actions (no git credentials in the engineering environment).
- `pnpm verify` **green** (72 tests across the workspace); compose healthy; migrations 0000–0002 applied locally; a scripted live e2e passed (see below) and its throwaway database/queue state was cleaned up afterwards.
- ⚠️ Standing from M2: both M1 and M2 merged as merge commits, not squash — enforce squash/linear history in branch protection or consciously amend D11. Dependabot queue (5 branches) still awaiting individual review. Merged remote branches can be deleted on GitHub.

## What Milestone 3 added (all on `feat/flakiness-detection`)

- **ADR-0010** (detection algorithm — the project's most important ADR) and **ADR-0011** (advisory Checks-API annotation). ⚠️ ADR-0011 was authored in this session's autonomous continuation — the founder should review it explicitly before the PR merges.
- `packages/db`: migration 0002 — `test_flake_scores` (one row per test identity; evidence counts stored for explainability; unique identity index + repo/verdict index), `repositories.default_branch` (transition-evidence gate; never clobbered by payloads omitting it), `workflow_runs.flake_check_run_id` (annotation idempotency).
- `apps/worker/src/detection/`: `score.ts` (pure: history → assessment; divergence weight 1.0, transitions 0.25 on the default branch only, 14d half-life decay, saturation K=2, always-failing scores zero) and `detection-stage.ts` (event-driven recompute after results persist; recompute set = failed-in-run ∪ non-healthy-present-in-run; 90-day bounded history; worst-status-per-run aggregation for parameterized tests; upserts).
- `apps/worker/src/annotation/annotation-stage.ts`: `DevFlow flake report` check run on the run's head sha — always `neutral`, silent unless a failing test carries a non-healthy verdict, POST once then PATCH via `flake_check_run_id`, PATCH-to-all-clear on a reprocess that stops flagging, evidence in plain language, 20-test cap with stated overflow.
- GitHub client: `createCheckRun` / `updateCheckRun` (404/410 permanent, else transient — same taxonomy as M2).
- Pipeline: artifact stage returns `succeeded | no_artifacts`; detection runs only on `succeeded`; annotation `PermanentJobError`s are absorbed with a warning (results + scores are already durable), transient errors retry the convergent job.
- Config: `DEVFLOW_FLAKE_HALF_LIFE_DAYS / _SATURATION_K / _FLAKY_THRESHOLD / _SUSPECT_THRESHOLD` (defaults 14 / 2.0 / 0.5 / 0.25, chosen to under-flag; boot-time cross-field validation suspect < flaky). `.env.example` documents them.
- Docs: dev-log M3 entry, roadmap M3 → completed, ADR table + session history + interview-notes §4 updated, github-app-setup.md now requires **Checks: read-and-write** (with the re-approval path for pre-M3 Apps), `docs/architecture/` filled from real code.

### Verification actually run (not asserted)

- `pnpm verify` green: format, lint, typecheck, build, 72 tests (detection units pin ADR-0010's reference arithmetic; detection/annotation integration suites run on real Postgres; check-run client tests on MockAgent).
- **Live local e2e** (scripts in the session scratchpad, throwaway `devflow_e2e` db since dropped): real API (port 3199) + real worker + stub GitHub API — three signed deliveries (fail@sha-A run 9001, pass@sha-A run 9002, fail@sha-B run 9003, same PR branch) → all `succeeded` → `test_flake_scores`: score **0.3323**, verdict **suspected**, 1 divergence / 0 transitions (matches ADR math exactly) → stub received exactly one `POST /check-runs` (neutral, title "1 suspected-flaky among 1 failing test", evidence table) → `flake_check_run_id = 424242` persisted → redelivered GUID: HTTP 200 duplicate, state converged (1 score row, 1 check). Note: a redelivery of a _completed_ job does not reprocess while the completed job is retained (`removeOnComplete: {count:1000}` jobId dedup — documented M2 behavior); the PATCH path triggers on genuine reprocessing and is covered by integration tests.

### Commit sequence (on the branch)

1. `feat(db): add flake score schema, default branch and check-run tracking` — packages/db + migration 0002.
2. `feat(worker): implement deterministic flakiness scoring` — detection/score.ts + its unit tests + ADR-0010.
3. `feat(worker): recompute flake scores after each ingested run` — detection-stage, config knobs, normalize-run default-branch capture, artifact-stage outcome + tests.
4. `feat(worker): add advisory check-run annotation for flaky failures` — annotation stage, client check-run endpoints, ADR-0011, github-app-setup update + tests.
5. `feat(worker): wire detection and annotation into the ingest pipeline` — process-job/main wiring + pipeline tests.
6. `docs(docs): record milestone 3 across project memory and architecture docs`.

## Open founder items

1. **Review ADR-0011** (authored autonomously; direction was fixed by ADR-0010's references but the document itself is new).
2. **Backfill decision:** installation-time backfill (roadmap M3 scope) deliberately deferred — needs a design pass (API listing of historical runs, artifact expiry limits, rate budget for burst jobs). Options: M3.5 mini-milestone, or fold into M6 demo tooling. Detection works from the first ingested run either way.
3. Commit/push/PR for M3 (sequence above); then real-GitHub verification with **Checks: write** added to the App (github-app-setup.md) — this also makes dogfooding produce real annotations, the calibration data ADR-0010 wants.
4. Standing housekeeping: squash-vs-D11 branch protection decision, Dependabot queue, merged-branch cleanup.

## Known technical debt (accepted, tracked)

1. C2 (M0): commitlint CI job installs the whole workspace.
2. Rate-limit handling reactive-only; artifact pagination bounded 10×100; no worker health endpoint (ADR-0009).
3. Docker-less `pnpm verify` fails at the test leg (needs Postgres+Redis) — accepted, fixtures-over-mocks.
4. M3: per-identity score upserts in a loop (batch only if measured to hurt); stale non-healthy scores persist until the identity reappears (M4 dashboard applies decay-at-read); 403-on-unapproved-Checks-permission retries into the DLQ (documented in ADR-0011).

## Environment notes (this machine)

- WSL2; repo on `/mnt/d` (drvfs) — slow fs; cold server start up to ~16s: **poll, never sleep-once**; check port ownership before trusting a green curl.
- pnpm shim: `~/.local/bin/pnpm` (corepack, no sudo); Turbo needs it on PATH: `export PATH="$HOME/.local/bin:$PATH"`.
- Node 20.19.4 (`.nvmrc` targets 22; floor `>=20.19.0`). No `jq` (use `node -e`), no `gh` (public-API reads via curl work), no non-interactive git credentials — **push/PR/merge are founder actions**.
- GitHub username: `annacrisstina`. Contact email: rohike.contact@gmail.com.
- Gotcha discovered this session: generation tooling can emit literal NUL bytes where `\u0000` escape sequences were intended in source — check with `cat -A` if a string constant misbehaves.

## Things to remember before continuing

- **Milestone workflow + NEVER list** ([implementation-rules.md](../project-memory/implementation-rules.md)): design before files, run verifications for real, founder confirmation at milestone boundaries, PRs only, no AI-attribution trailers in commits.
- Gate commits on verify with `&&`, never `;`.
- Update this file every session; dev-log every milestone; project memory on significant decisions.
- The founder communicates in Romanian; the repository is entirely in English.
- **Next milestone after M3 merges: M4** — dashboard + live feed + quarantine (workspace-tenancy ADR + auth ADR due; design step first).
