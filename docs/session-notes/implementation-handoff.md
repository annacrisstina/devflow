# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-07-18 (M2 post-merge closeout)

## Current repository status

- **`main`:** at `eb80d9b` = merge of **PR #7 (Milestone 2)**, in sync with origin. History contains no AI-attribution trailers (stripped pre-push at the founder's direction).
- **CI on `main`: green** — verified via the public checks API; this was the **first successful run of the Postgres + Redis service containers** on GitHub runners, so the M2 verification story is now fully proven remotely.
- **Milestones 0, 1, 2: complete and merged.** M3 (flakiness detection + PR annotation) is next; its architecture review has not started yet.
- **Local infra:** compose healthy; migrations 0000+0001 applied; app tables empty.
- ⚠️ **Both M1 and M2 merged as merge commits, not squash** — either enforce squash/linear history in branch protection or consciously amend D11 to match practice; the discrepancy shouldn't persist unacknowledged.
- **Dependabot queue (5 branches):** ESLint 10, TypeScript 6, commitlint cli + config majors, github-actions updates — review individually per D13; not blocking.
- Merged remote branches `feat/db-webhook-events`, `feat/artifact-pipeline` can be deleted on GitHub (housekeeping).

## What exists on main (after M0–M2)

- `apps/api` — Fastify 5: HMAC-verified (constant-time, raw-bytes, verify-before-parse), delivery-GUID-idempotent `POST /webhooks/github` persisting raw events append-only; enqueues `process-workflow-run` for `workflow_run/completed` (duplicate path re-enqueues → redelivery repairs lost jobs); `/healthz`.
- `packages/queue` — BullMQ contract: dispatch-not-store payloads (`webhookEventId` + `deliveryId`), retry policy (5 attempts, exponential backoff), jobId dedup, failed set = DLQ.
- `packages/db` — Drizzle schema + forward-only migrations: `webhook_events` (raw, append-only) + `repositories`, `workflow_runs` (attempts as rows), `run_artifacts`, `test_results` (replace-per-run idempotency).
- `apps/worker` — BullMQ consumer: load-event → normalize-run (convergent upserts) → artifact stage (in-house GitHub App client: hand-rolled RS256 JWT, single-flight token cache; streamed zip download; saxes streaming JUnit parse with caps) → transactional persist. Permanent-vs-transient failure taxonomy. Delivery GUID correlates logs end to end.
- ADR-0001…0009; CI with real gates + both service containers; 51 tests on real backends.

## Open founder items (unchanged from M2 closeout)

1. **Real-GitHub end-to-end** (status unknown to the engineer): GitHub App created per [github-app-setup.md](../github-app-setup.md) + private key generated (`DEVFLOW_GITHUB_APP_ID`, `DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64` in `.env`) + api/worker/smee running against a repo whose workflow uploads a JUnit XML artifact → `workflow_runs.processing_status = 'succeeded'`, rows in `test_results`. This also starts **dogfooding**, which builds the data corpus M3's detection will be tuned against.
2. Branch-protection decision (squash vs amend D11), Dependabot reviews, remote branch cleanup — housekeeping above.

## Next: Milestone 3 — flakiness detection engine + PR annotation

The killer feature. Scope per [roadmap.md](../project-memory/roadmap.md): same-commit divergence detection (schema already keyed for it), transition-history scoring with temporal decay, configurable thresholds, Checks API write-back (permissions grow to Checks:write → installer re-approval), installation-time backfill. **ADR due: the detection algorithm — the most important ADR of the project.**

**Exact starting point for the next session:** produce the M3 architecture review (milestone workflow steps 1–2: goal + design decisions, no files) → founder approval → implement component by component. Detection quality discussion needs honest treatment of the false-positive asymmetry (wrongly calling a real regression "flaky" is the worst failure mode — see interview-notes §4).

## Known technical debt (accepted, tracked)

1. C2 (M0): commitlint CI job installs the whole workspace → isolate when it hurts.
2. `docs/architecture/` placeholder — two milestones of real code now exist to diagram; fill before or with M3.
3. Rate-limit handling reactive-only; artifact pagination bounded 10×100; no worker health endpoint (ADR-0009 / dev-log M2).
4. Docker-less `pnpm verify` fails at the test leg (needs Postgres+Redis) — accepted, fixtures-over-mocks.

## Environment notes (this machine)

- WSL2; repo on `/mnt/d` (drvfs) — slow fs; cold server start up to ~16s: **poll, never sleep-once**; check port ownership before trusting a green curl.
- pnpm shim: `~/.local/bin/pnpm` (corepack, no sudo); Turbo needs it on PATH: `export PATH="$HOME/.local/bin:$PATH"`.
- Node 20.19.4 (`.nvmrc` targets 22; floor `>=20.19.0`). No `jq` (use `node -e`), no `gh` (public-API reads via curl work), no non-interactive git credentials — **push/PR/merge are founder actions**.
- GitHub username: `annacrisstina`. Contact email: rohike.contact@gmail.com.

## Things to remember before continuing

- **Milestone workflow + NEVER list** ([implementation-rules.md](../project-memory/implementation-rules.md)): design before files, run verifications for real, founder confirmation at milestone boundaries, PRs only.
- Gate commits on verify with `&&`, never `;`.
- Update this file every session; dev-log every milestone; project memory on significant decisions.
- The founder communicates in Romanian; the repository is entirely in English.
