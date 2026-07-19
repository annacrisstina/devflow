# Project Overview

> Part of the [project memory](../README.md#project-memory). This document is the canonical answer to "what is DevFlow and why does it exist?" — independent of any chat history or the founder's memory. Update it whenever product scope or goals change.

## Vision

**DevFlow** is an open-source, self-hostable **CI reliability platform** for GitHub Actions. It detects, quantifies and proposes quarantine for **flaky tests** — tests that pass and fail nondeterministically without code changes — before they erode a team's trust in its CI pipeline.

High-level positioning: a "Developer Productivity Platform" whose first (MVP) module is CI reliability. Everything else is post-MVP.

## Problem statement

A flaky test is the most expensive kind of noise in a CI pipeline:

- It **blocks merges** for reasons unrelated to the change under review.
- It forces **blind re-runs** (minutes × developers × day of wasted compute and attention).
- Worst of all, it **trains engineers to ignore red builds** — once "just re-run it" becomes reflex, real regressions ride in unnoticed. Google has published that ~16% of their tests exhibited flakiness and identified flaky tests as the primary driver of lost trust in CI signal.

What teams do today: `retry: 3` in config (hides the problem), `skip` with a TODO that never gets resolved, or simply suffer. Existing products that solve this properly — BuildPulse, Trunk Flaky Tests, Datadog CI Visibility, Launchable — are **closed SaaS, per-seat, enterprise-priced**. There is no serious open-source, self-hostable alternative. That is the gap DevFlow fills.

## Target users

1. **P0 — the developer whose PR is red for someone else's flaky test.** DevFlow annotates the PR check: "2 known-flaky tests failed — not your fault." This is the daily touchpoint.
2. **P1 — the maintainer / tech lead** who owns suite health: reviews flakiness reports, approves quarantine, tracks trends.
3. **P2 — OSS maintainers** who want this without paying per-seat SaaS prices and without sending their CI data to a third party.

## Why this project exists (honest version)

This is a **portfolio project first**, built by a third-year Computer Science student (UPB ACS CTI, Bucharest) applying in 2027 for internships and Junior Software Engineer positions. It is optimized explicitly for:

- **CV impact and recruiter pattern-matching** — "CI reliability / devtools" maps directly onto the domains of the target companies.
- **Interview material** — every architectural component (webhook ingestion, queues, idempotency, statistical detection, disciplined AI) doubles as a System Design interview answer.
- **GitHub presence** — a mature, disciplined, genuinely usable open-source repository.

It is NOT optimized for startup viability, monetization, or growth. When a product decision and a portfolio decision conflict, the portfolio decision wins. That said, the product must be _real_: it solves a genuine problem, it must be genuinely usable, and its engineering must be honest — because faked engineering is detectable in interviews.

## Target companies

Microsoft, Google, Amazon, Adobe, Stripe, Oracle, UiPath, Bitdefender, plus serious startups. The common denominator: enterprise/B2B/infrastructure engineering cultures that value event-driven systems, integrations, reliability and production discipline over consumer UI polish.

## Success criteria

1. **Finished** — a demo-able end-to-end product in 3–4 months of part-time solo work. "Promised but unfinished" is worse on a CV than "smaller but complete."
2. **Self-demonstrating** — installable on any public repo via GitHub App; `docker compose up` self-hosting works first try.
3. **Interview-generating** — every milestone produces at least one architecture discussion the founder can carry for 45 minutes.
4. **Honestly engineered** — CI gates that actually gate, ADRs with real trade-offs, no résumé-driven tech that isn't load-bearing.

## MVP scope

- **GitHub Actions only** (adapter pattern in design, single adapter in code).
- **JUnit XML only** as the test report format (the de-facto standard — Jest, Pytest, JUnit, dotnet test all export it).
- Webhook ingestion (HMAC-verified, idempotent) → queue → workers that download and parse artifacts → test results in Postgres.
- Statistical flakiness detection: same-commit pass/fail divergence (strong signal); pass↔fail transition history without related file changes (probabilistic signal); scoring with temporal decay.
- PR annotation via GitHub Checks API ("known-flaky failures — not your fault").
- Quarantine workflow: **proposed by the system, approved by a human, never automatic.**
- Live dashboard feed of runs in progress (WebSockets).
- Self-hostable via docker compose.

Explicitly OUT of MVP: other CI providers, other report formats, on-call/paging features, status pages, project management, AI-driven decisions of any kind.

## Where AI is used — and where it is banned

**Used (assistive, always human-reviewed):** clustering failure logs ("these 40 failures share one cause"), summarizing the likely root cause of a flaky test, semantic search over failure history (pgvector embeddings).

**Banned:** AI never decides quarantine, never marks a test flaky on its own, never auto-resolves anything. Detection is deterministic/statistical; thresholds are configurable and human-approved. Principle: **AI assists, never decides.** Removing the AI layer entirely leaves the product ~100% functional — that is the proof it is not an AI wrapper. _(Implemented in M5 exactly on these lines: ADR-0017 makes the boundary mechanical — enumerated call sites, a deletion test, and clustering turned out to need no LLM at all.)_

## Long-term vision (post-MVP, not commitments)

- Additional CI adapters (GitLab CI, CircleCI) using the adapter seam designed in MVP.
- Additional report formats (TAP, JSON reporters).
- Trend analytics: build-time regressions, suite-health scoring over time.
- Team features: ownership mapping (CODEOWNERS-based routing of flaky-test alerts).
- The broader "Developer Productivity Platform" umbrella only if the CI reliability module succeeds on its own.

## Why this project won over every previous alternative

Chronological record of rejected directions (full reasoning in [session-history.md](session-history.md)):

1. **Pulse** — abandoned before this project's design phase began (predecessor idea).
2. **StudyRooms** (collaborative exam-prep platform: RAG + mastery tracking + real-time study rooms) — fully designed, then rejected after a deliberate head-to-head reality check. Scored 100 vs DevFlow's 132 across 16 hiring-signal axes. Fatal weaknesses: EdTech-consumer category pattern-matches to "bootcamp project" for enterprise recruiters; event-driven architecture would have been artificial bolt-on; three independent pillars made 3–4-month completion improbable; its genuine strengths (collaborative frontend, CRDT/presence) transfer only to companies like Figma/Notion/Linear, none of which are on the target list.
3. **DevFlow as Incident Response Platform** (open-source incident.io alternative) — proposed and defended by the tech-lead role, rejected by the founder for one decisive reason the scoring had underweighted: **authenticity**. A student who has never been on-call cannot credibly narrate incident response in an interview. The lesson was generalized into a selection principle: _build in a domain where you are genuinely the user._
4. **DevFlow as CI Reliability Platform** — selected. Every student who has pushed code to GitHub Actions has personally experienced flaky tests. Same gap coverage as incident response (webhooks, queues, real-time, disciplined AI), smaller integration surface (one critical integration instead of three), and demo-able against real public repositories without simulating a fictional company.

A standing rule was set after the third pivot: the choice-of-project question is **closed**. Reopening it requires a concrete technical blocker, not a better idea.
