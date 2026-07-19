# DevFlow

> **CI reliability for GitHub Actions** — detect, quantify and quarantine flaky tests before they erode your team's trust in CI.

[![CI](https://github.com/annacrisstina/devflow/actions/workflows/ci.yml/badge.svg)](https://github.com/annacrisstina/devflow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Status: early development.** The product works end to end: webhook ingestion → artifact parsing → deterministic flakiness scoring → advisory PR check runs, plus a workspace dashboard with GitHub login, a live run feed and a human-approved quarantine workflow (milestones 0–4). Next up: the assistive AI layer and self-hosting hardening — watch the repo if you want to follow along.

## The problem

A flaky test — one that passes and fails nondeterministically without code changes — is the most expensive kind of noise in a CI pipeline. It blocks merges, forces re-runs, and worst of all it trains engineers to ignore a red build. Existing solutions (BuildPulse, Trunk, Datadog CI Visibility) are closed SaaS. DevFlow is the open-source, self-hostable alternative: it ingests your GitHub Actions results, identifies which failures are flakiness rather than regressions, and tells you on the PR itself.

## How it will work

1. Install the DevFlow GitHub App on your repositories.
2. Every workflow run is ingested via webhooks; test reports (JUnit XML) are parsed in background workers.
3. A statistical engine scores each test's flakiness from its history (same commit, different outcomes; pass/fail transitions without related changes).
4. Known-flaky failures are annotated directly on your PR checks; quarantine is proposed — never applied automatically.

## Quickstart (development)

Prerequisites: Node.js ≥ 20.19 (22 LTS recommended, see `.nvmrc`), pnpm ≥ 10 (via `corepack enable`), Docker with Compose v2.

```bash
git clone https://github.com/annacrisstina/devflow.git
cd devflow
./scripts/doctor.sh        # verifies your toolchain
docker compose up -d       # Postgres 17 (pgvector) + Redis 7
pnpm install
pnpm verify                # format check, lint, typecheck, build, test
```

## Repository layout

```
apps/           Deployable applications (API server, web UI) — added per milestone
packages/       Shared internal packages (config, domain types, DB schema)
docs/           Documentation
  adr/          Architecture Decision Records — the "why" behind every big choice
docs/conventions.md   Naming, coding standards, commits, branching
scripts/        Developer tooling (setup checks, local automation)
compose.yaml    Local development infrastructure (Postgres, Redis)
```

## Documentation

- [Architecture Decision Records](docs/adr/) — start with [ADR-0001](docs/adr/0001-record-architecture-decisions.md)
- [Engineering conventions](docs/conventions.md)
- [Contributing guide](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)

## License

[MIT](LICENSE)
