# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-07-18 (end of session, M2 complete)

## Current repository status

- **`main`:** at `7e49ed4` (merge of PR #6 = Milestone 1), in sync with origin. ⚠️ PR #6 was merged with a **merge commit**, not squash — if squash-only/linear history is still the intent (D11), enable it in branch protection settings.
- **Branch `feat/artifact-pipeline`** (local only — the engineer has no push credentials): **Milestone 2 complete and locally verified end-to-end**, as six commits:
  1. `feat(ingest): dispatch workflow-run processing jobs through BullMQ`
  2. `feat(db): add normalized repositories, runs and test results schema`
  3. `feat(worker): add ingest worker skeleton normalizing workflow runs`
  4. `feat(worker): add GitHub App auth and artifact API client`
  5. `feat(worker): parse JUnit artifacts and persist normalized test results`
  6. `docs(docs): record milestone 2 completion in project memory` (this commit)
- **Local infra:** compose healthy; migrations 0000+0001 applied; all app tables truncated after e2e (clean).
- **Dependabot PRs open:** ESLint 10, TypeScript 6 (majors — review individually per D13; not blocking).

## Milestone 2 — what shipped

Full record: [development-log.md](../development-log.md) M2 entry. Pipeline: `workflow_run.completed` webhook → raw persist (M1) → BullMQ job (`@devflow/queue`, dispatch-not-store, jobId dedup) → `@devflow/worker` (normalize with convergent upserts → GitHub artifact list/download via in-house App client → streaming JUnit parse with caps → replace-per-run persist) → `test_results`. Failure taxonomy: transient throws → 5 backoff retries → failed set (DLQ); `PermanentJobError` → run marked `failed`, job completes. Delivery GUID correlates logs across api→queue→worker. ADR-0007/0008/0009. 51 tests; live local e2e against a stub GitHub API produced 8 correctly classified results and converged under redelivery.

## Founder actions to close M2 (in order)

1. **Push `feat/artifact-pipeline`** and open the PR. Single-PR squash title suggestion (commitlint-valid): `feat(worker): add artifact pipeline from webhook to test results`. (Or sequential per-commit PRs as with M1 — see M1 handoff pattern.)
2. **Confirm CI green on GitHub** — first run with the Redis service container.
3. **Real-GitHub verification** (needs the App from M1's checklist, now + a private key):
   - App settings → generate private key; `.env` gets `DEVFLOW_GITHUB_APP_ID` + `DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64` ([github-app-setup.md](../github-app-setup.md), updated this session).
   - Run api + worker + smee; push to an installed repo whose workflow uploads a JUnit XML artifact; check `workflow_runs.processing_status = 'succeeded'` and `test_results` rows.
4. **Confirm Milestone 2** → M3 design starts.

## Next milestone: M3 — flakiness detection engine + PR annotation

The killer feature. Scope per [roadmap.md](../project-memory/roadmap.md): same-commit divergence detection (attempts are already separate rows — the schema was shaped for this), transition-history scoring with temporal decay, configurable thresholds, Checks API write-back (worker gains Checks:write → installers re-approve permissions), installation-time backfill. **ADR due: the detection algorithm — the most important ADR of the project.** Design step first, per milestone workflow. M3 also needs real accumulated data — the founder running DevFlow on its own repo (dogfooding) between milestones builds the corpus detection will be tuned against.

## Remaining blockers

- Founder actions above. M3 _design_ is unblocked; M3 _validation_ wants real data from dogfooding.

## Repository health

- `pnpm verify` fully green: 4 packages, 51 tests (real Postgres + real Redis locally and in CI). Both CI service containers untested on GitHub until the M2 PR runs.

## Known technical debt (accepted, tracked)

1. C2 (M0): commitlint CI job installs the whole workspace → isolate when it hurts.
2. `docs/architecture/` placeholder — now two milestones of real code to diagram; fill before M3 ships or with it.
3. Rate-limit handling reactive-only; artifact pagination bounded 10×100; no worker health endpoint (ADR-0009 / dev-log M2; revisit on evidence or in M6).
4. Docker-less `pnpm verify` fails at the test leg (needs Postgres+Redis) — accepted, fixtures-over-mocks.

## Environment notes (this machine)

- WSL2; repo on `/mnt/d` (drvfs) — slow fs; cold server start up to ~16s: **poll, never sleep-once**, and check port ownership before trusting a green curl (stale-process incidents in both M1 and M2).
- pnpm shim: `~/.local/bin/pnpm` (corepack, no sudo); Turbo needs it on PATH: `export PATH="$HOME/.local/bin:$PATH"`.
- Node 20.19.4 (`.nvmrc` targets 22; floor `>=20.19.0`). No `jq` (use `node -e`), no `gh`, no non-interactive git credentials.
- GitHub username: `annacrisstina`. Contact email: rohike.contact@gmail.com.

## Things to remember before continuing

- **Milestone workflow + NEVER list** ([implementation-rules.md](../project-memory/implementation-rules.md)): design before files, run verifications for real, founder confirmation at milestone boundaries, PRs only.
- Gate commits on verify with `&&`, never `;` — one red commit slipped through this session and had to be amended.
- Update this file every session; dev-log every milestone; project memory on significant decisions.
- The founder communicates in Romanian; the repository is entirely in English.
