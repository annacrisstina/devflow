# ADR-0002: Monorepo with pnpm workspaces and Turborepo

- **Status:** Accepted
- **Date:** 2026-07-14
- **Deciders:** project owner

## Context

DevFlow consists of several deployable units that share code: an API server (webhook ingestion + REST), background workers (artifact parsing, flakiness scoring), a web UI, and shared packages (domain types, database schema, configuration). They evolve in lockstep — a change to the events schema touches ingestion, workers and UI in the same change set. The team is one person; any coordination overhead between repositories is pure waste.

## Decision

A single repository (monorepo) using **pnpm workspaces** for package management and **Turborepo** for task orchestration.

- Layout: `apps/*` for deployable applications, `packages/*` for internal shared packages.
- pnpm over npm/yarn: strict `node_modules` layout prevents phantom dependencies (a package importing something it never declared — the classic monorepo rot); workspace protocol (`workspace:*`) makes internal dependencies explicit; disk-efficient content-addressed store.
- Turborepo over plain pnpm scripts: task graph awareness (`build` of an app depends on `build` of its packages), local + CI caching, and near-zero configuration. Over Nx: Nx's generators and plugin ecosystem add power we don't need at this scale, at the cost of a heavier mental model; Turborepo does the 20% we need.

## Alternatives considered

- **Polyrepo** (one repo per service): cross-cutting changes would need coordinated PRs and versioned publishing of shared packages — unjustifiable overhead for a solo team, and it fragments the portfolio story into repos that each look small.
- **Single-package monolith**: simplest start, but the API/worker/web boundary is load-bearing in this architecture (independent scaling and deployment of ingestion vs workers). Erasing it in code layout invites coupling that is expensive to unwind later.
- **Nx**: see above — rejected for weight, not capability.

## Consequences

- Positive: atomic cross-cutting changes; one CI pipeline; one set of conventions; shared tooling configured once.
- Positive: repository structure itself communicates the architecture (`apps/` vs `packages/`).
- Negative: CI must be task-graph aware to avoid rebuilding the world on every PR — mitigated by Turborepo caching.
- Negative: all components share one dependency tree, so a major-version bump (e.g. a framework) hits everything at once. Accepted at this scale.
