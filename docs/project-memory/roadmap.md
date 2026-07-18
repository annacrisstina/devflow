# Roadmap

> Part of the [project memory](../README.md#project-memory). Milestone plan, ordering rationale and dependencies. Dates are targets, not promises; scope cuts are pre-planned (see "Cut lines" below) so slipping costs features, not completion.

## Timeline frame

~3–4 months of part-time solo work (student schedule), targeting a demo-able, self-hostable MVP well before 2027 internship application season.

## Completed

### Milestone 0 — Repository foundation ✅ (2026-07-14, commit pending founder confirmation)

Monorepo (pnpm + Turborepo), engineering standards (ESLint/Prettier/commitlint/EditorConfig), GitHub Flow + Conventional Commits, CI skeleton (quality + commitlint jobs, SHA-pinned actions), dev environment (compose: pgvector Postgres 17 + Redis 7 AOF, loopback-bound), governance (README/LICENSE/CONTRIBUTING/SECURITY/CoC/CODEOWNERS/issue forms/PR template/Dependabot), ADR-0001/0002, doctor script, project memory docs. Passed a formal readiness review after remediating 5 blockers. Details: [development-log.md](../development-log.md).

### Milestone 1 — GitHub App + webhook ingestion skeleton ✅ (2026-07-18, merged to main in PR #6)

`apps/api` (Fastify 5) + `packages/db` (Drizzle): HMAC-verified (constant-time, raw bytes, verify-before-parse), delivery-GUID-idempotent `POST /webhooks/github` persisting raw payloads append-only; `/healthz`; boot-time config validation; ADR-0003…0006; CI gates activated with a real Postgres service container; end-to-end verified through a live smee.io tunnel. Founder-trimmed scope honored: no queue enqueue, no installation-token client, no App private key (all M2). GitHub App creation is a documented founder step ([github-app-setup.md](../github-app-setup.md)). Details: [development-log.md](../development-log.md).

### Milestone 2 — Artifact pipeline: queue + worker + JUnit parsing ✅ (2026-07-18, merged to main in PR #7)

`@devflow/queue` (BullMQ contract: dispatch-not-store, retry policy, jobId dedup) + API producer (enqueue after persist, redelivery-as-repair) + normalized schema (`repositories`, `workflow_runs` keyed `(github_run_id, run_attempt)`, `run_artifacts` diagnostics, `test_results` with replace-per-run idempotency) + `@devflow/worker` (bounded concurrency, permanent-vs-transient failure taxonomy, DLQ = BullMQ failed set) + in-house GitHub App client (hand-rolled RS256 JWT, single-flight token cache) + streaming JUnit parser (saxes, fixture corpus, size caps). ADR-0007/0008/0009. 51 tests + live local e2e (stubbed GitHub): signed webhook → 8 correctly classified result rows; redelivery converges. **Deviations (founder-approved):** workspace-tenancy ADR deferred to M4 (installation is tenancy root; seam recorded in ADR-0008); partitioning deferred with explicit triggers; rate-limit handling reactive-only. Real-GitHub verification = founder step ([github-app-setup.md](../github-app-setup.md)). Details: [development-log.md](../development-log.md).

## Future milestones (order is load-bearing)

### Milestone 3 — Flakiness detection engine + PR annotation

**Goal:** the killer feature — DevFlow tells a developer "this failure is a known flake, not you."
**Scope:** detection: same-commit divergence (retry pass after fail = strong signal), transition-history scoring with temporal decay; configurable thresholds; **Checks API write-back** on PRs; backfill of recent history at installation time (data-volume mitigation).
**ADRs due:** detection algorithm (the statistical heart — most important ADR of the project).
**Depends on:** M2 (needs test-result history).

### Milestone 4 — Dashboard + live feed + quarantine workflow

**Goal:** the product becomes visible and daily-usable.
**Scope:** `apps/web` (React), Auth.js GitHub login, workspace/repo views, flakiest-tests ranking, Socket.IO live run feed (Redis pub/sub fan-out), quarantine propose→human-approve→track workflow.
**Depends on:** M3 (needs scores to display); auth lands here because this is the first user-facing surface.

### Milestone 5 — AI layer (assistive only) + semantic search

**Goal:** disciplined AI on top of a complete product.
**Scope:** failure-log clustering ("these 40 failures share one cause"), root-cause-hypothesis summarization for a flaky test, pgvector semantic search over failure history. All behind the amputable-AI interface; all outputs advisory.
**ADRs due:** AI boundary formalization; embedding/model choices.
**Depends on:** M2–M3 (needs failure corpus). Deliberately last: proves the product stands without it.

### Milestone 6 — Production hardening + release

**Goal:** "a stranger can run this."
**Scope:** one-command self-host path (compose including apps), seed/demo data + synthetic flaky-repo generator, dogfooding on DevFlow's own CI, observability polish (metrics, health endpoints), docs (architecture diagrams from real code, self-hosting guide), demo video, v0.1.0 tag + CHANGELOG.

## Dependency graph

```
M0 ─▶ M1 ─▶ M2 ─▶ M3 ─▶ M4 ─▶ M6
                   └──▶ M5 ──▶─┘   (M5 parallelizable with M4 if time allows)
```

## Pre-planned cut lines (if the schedule slips)

1. **First cut:** M5 shrinks to summarization-only (clustering and semantic search dropped).
2. **Second cut:** quarantine becomes flagging-only (no tracked workflow).
3. **Third cut:** live feed becomes polling (Socket.IO deferred) — cut last because real-time is a named portfolio goal.
4. **Never cut:** M1–M3. Ingestion → parsing → detection with PR annotation IS the product; without them there is nothing to show.

## MVP definition (release gate for v0.1.0)

Install the GitHub App on a repo → push code → runs ingested → JUnit results parsed → flaky tests detected and scored → PR check annotates known-flaky failures → maintainer approves quarantine in dashboard → live feed shows activity. Self-hostable with `docker compose up`.

## Post-MVP (recorded, not committed)

GitLab CI / CircleCI adapters; TAP + JSON report formats; trend analytics (build-time regressions, suite health over time); CODEOWNERS-based flake-alert routing; Slack notifications; public sample instance.
