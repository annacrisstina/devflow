# Changelog

All notable changes to DevFlow are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/). DevFlow releases are git tags + GitHub Releases — nothing publishes to npm.

## [0.1.0] — 2026-07-19

First release: an open-source, self-hostable CI reliability platform for GitHub Actions — flaky test detection, quantification and human-approved quarantine.

### Added

- **Ingestion** — HMAC-verified, delivery-GUID-idempotent GitHub webhook endpoint persisting raw payloads append-only; redelivery is the recovery path (ADR-0005/0006).
- **Artifact pipeline** — BullMQ workers normalize runs, fetch artifact zips through an in-house GitHub App client, and stream-parse JUnit XML with replace-per-run idempotency (ADR-0007/0008/0009).
- **Flakiness detection** — deterministic two-signal evidence model: same-commit divergences (weight 1.0) and default-branch transitions (0.25), exponential decay (14-day half-life), saturating score with under-flagging thresholds; always-failing tests score zero (ADR-0010). Scores decay at read time so stale verdicts quietly degrade (ADR-0014).
- **PR annotation** — advisory `neutral` check runs that can never block a merge, silent when there is nothing to say, idempotent under reprocessing (ADR-0011).
- **Dashboard** — React SPA with GitHub login (Auth.js, database sessions), workspace tenancy with installation claiming, ranked flaky tests with plain-language evidence, run history, and a Socket.IO live feed (ADR-0012–0015).
- **Quarantine** — propose → human-approve → track; proposals are a query, decisions are durable rows, quarantined failures get labeled in the PR check. AI never decides (ADR-0016).
- **Assistive AI layer** (fully removable) — local MiniLM embeddings for semantic failure search and clustering (no key, no external calls), plus opt-in BYO-key LLM root-cause hypotheses, human-triggered, cached, provenance-stamped (ADR-0017–0019).
- **Self-hosting** — one command (`docker compose --profile full up -d --build`): multi-stage images, one-shot migration service, dashboard and embedding model baked in, works air-gapped ([docs/self-hosting.md](docs/self-hosting.md), ADR-0020).
- **Observability** — `/healthz` with real dependency checks and Prometheus `/metrics` on both processes; the alertable number is `devflow_queue_jobs{state="failed"}` (ADR-0021).
- **Demo tooling** — `pnpm demo:seed` replays a curated synthetic history through the real pipeline; a flaky-repo template (`scripts/demo/flaky-repo/`) generates live evidence on real GitHub Actions.
- **Dogfooding** — DevFlow's own CI uploads its JUnit results for a DevFlow deployment to ingest.

### Known limitations

- Workspaces are single-member (no invites yet); the schema is team-ready.
- JUnit XML is the only ingested report format; GitHub Actions is the only CI provider (adapter seams exist by design, not code).
- No history backfill at installation time — detection warms up from the first ingested run (deliberate v0.1.0 cut; planned post-MVP).
- GitHub rate-limit handling is reactive-only; artifact listings are read unpaginated (bounded).
- `/metrics` is unauthenticated by stated posture — restrict it at your reverse proxy. Metric names (`devflow_*`) are API surface; renames will be breaking changes.
- No automated UI tests; the dashboard is covered by API contract tests and a scripted end-to-end harness.
