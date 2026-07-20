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

### Milestone 3 — Flakiness detection engine + PR annotation ✅ (2026-07-18, merged to main in PR #8)

The killer feature: deterministic two-signal detection (ADR-0010 — same-commit divergence weight 1.0, default-branch transitions 0.25, exponential decay H=14d, saturating score, under-flagging thresholds via `DEVFLOW_FLAKE_*`) computed incrementally after each run's results persist, plus advisory PR annotation (ADR-0011 — neutral-only check run, silent when nothing to say, PATCH-idempotent). 72 tests + live local e2e (three signed deliveries → divergence → `suspected` 0.33 → check run with evidence table). **Deviation recorded for founder decision:** installation-time backfill deferred — needs its own design (run-history listing, artifact expiry, rate budget); detection works from the first ingested run. Details: [development-log.md](../development-log.md).

### Milestone 4 — Dashboard + live feed + quarantine workflow ✅ (2026-07-19, PR pending)

The product became visible: `apps/web` (Vite React SPA behind the API), Auth.js GitHub login on Fastify (ADR-0013), workspace tenancy with unclaimed-installation backfill and signed-state claiming (ADR-0012), `/api/v1` with decay-at-read scoring (ADR-0014), Socket.IO live run feed over Redis pub/sub (ADR-0015), quarantine propose→human-approve→track with check-run labeling (ADR-0016). 129 tests + a 14/14 scripted live e2e. **Deviations:** no workspace invites (single-member workspaces; schema is team-ready); real-GitHub OAuth/claim verification = founder step (App reconfiguration, github-app-setup.md §3b). Details: [development-log.md](../development-log.md).

### Milestone 5 — AI layer (assistive only) + semantic search ✅ (2026-07-19, PR pending)

The disciplined-AI milestone, split along the self-hosting line: semantic search + failure clustering on a **local** embedding model (MiniLM/pgvector, no key — ADR-0018) and human-triggered root-cause hypotheses behind a **BYO-key** LLM seam (Claude, cached, provenance-stamped — ADR-0019), all inside the amputable `@devflow/ai` package with enumerated call sites (ADR-0017). 158 tests + a 22/22 live e2e (real local model; stubbed LLM through the real client). **Deviations:** live-LLM verification = founder step (needs a key); the original "summarization-only" cut line was consciously inverted at review (founder-ratified) and unused. Details: [development-log.md](../development-log.md).

## Future milestones (order is load-bearing)

### Milestone 6 — Production hardening + release

**Goal:** "a stranger can run this."
**Scope:** one-command self-host path (compose including apps), seed/demo data + synthetic flaky-repo generator, dogfooding on DevFlow's own CI, observability polish (metrics, health endpoints), docs (architecture diagrams from real code, self-hosting guide), demo video, v0.1.0 tag + CHANGELOG.

## Dependency graph

```
M0 ─▶ M1 ─▶ M2 ─▶ M3 ─▶ M4 ─▶ M6
                   └──▶ M5 ──▶─┘   (M5 parallelizable with M4 if time allows)
```

## Pre-planned cut lines (if the schedule slips)

1. ~~**First cut:** M5 shrinks to summarization-only~~ (obsolete — M5 shipped whole; the ratified cut order had been inverted: the LLM half would have dropped first).
2. **Second cut:** quarantine becomes flagging-only (no tracked workflow).
3. **Third cut:** live feed becomes polling (Socket.IO deferred) — cut last because real-time is a named portfolio goal.
4. **Never cut:** M1–M3. Ingestion → parsing → detection with PR annotation IS the product; without them there is nothing to show.

## MVP definition (release gate for v0.1.0)

Install the GitHub App on a repo → push code → runs ingested → JUnit results parsed → flaky tests detected and scored → PR check annotates known-flaky failures → maintainer approves quarantine in dashboard → live feed shows activity. Self-hostable with `docker compose up`.

## Post-MVP (recorded, not committed)

Installation-time history backfill (cut from v0.1.0 by D-M6-1; needs its own design: run-history pagination, artifact expiry, burst rate-budgeting); GitLab CI / CircleCI adapters; TAP + JSON report formats; trend analytics (build-time regressions, suite health over time); CODEOWNERS-based flake-alert routing; Slack notifications; public sample instance.
