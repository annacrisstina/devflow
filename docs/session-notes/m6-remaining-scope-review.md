# M6 Remaining-Scope Architecture Review

> Produced 2026-07-19 from repository state alone, after the original M6 review was lost with the Docker-crash session (see session-history). Covers **only unimplemented scope**. Already implemented and approved — not revisited here: observability (ADR-0021), the e2e harness promotion, containerized self-hosting (ADR-0020 + `docs/self-hosting.md`). Status: **approved by the founder 2026-07-19** — D-M6-1 through D-M6-6 as recommended; D-M6-7 resolved as _keep the current merge policy, D11 unchanged during M6_. Decision record: [engineering-decisions.md](../project-memory/engineering-decisions.md#m6-remaining-scope-decisions-founder-ratified-2026-07-19).

## Goal restated

The M6 release gate: **"a stranger can run this"** — and, implicitly, _see it work_. What remains is everything between "the product self-hosts" and "v0.1.0 exists and demos itself": demo data, dogfooding, final docs, the release artifacts.

## Remaining scope — four components

### R1 — Seed/demo tooling (`pnpm demo:seed` + a flaky-repo template)

Two committed breadcrumbs from the lost design survive and pin the approach: root `package.json` already declares `"demo:seed": "node scripts/demo/seed.mjs"`, and `scripts/e2e/harness.mjs`'s header names `scripts/demo/seed.mjs` as its second consumer. So the ratified design was: **the seed tool replays a curated synthetic history through the real pipeline** (signed webhook deliveries + fixture JUnit zips against the stub GitHub, exactly like the e2e), _not_ a SQL dump.

Why replay beats a dump (re-derived, since the original argument is lost): it exercises the real ingestion/detection/embedding path, it can never drift from the schema (a dump silently rots with every migration), and every seeded row carries honest provenance (webhook_events → runs → results → scores).

Design points:

- **Curated story, not random noise:** a handful of repos; one clearly flaky test (same-commit divergences → score above 0.5), one suspected (two divergences — the just-below-threshold case the M4 e2e surfaced), one always-failing test (scores zero — showcases the ADR-0010 structural property), a healthy majority; distinct failure texts for search/cluster demos; run timestamps fabricated across the past ~3 weeks so decay-at-read produces visibly different scores.
- **Idempotent by construction:** deterministic delivery GUIDs → re-runs converge (replace-per-run), same as redelivery.
- **Workspace attachment:** if the founder's workspace exists (one real login), the seeded installation is linked to it directly in the DB (the signed-state claim flow is for real GitHub installs; demo data is local by definition); with no workspace yet, data seeds unclaimed and the script prints the login-then-rerun instruction.
- **A locality guard:** the script refuses to run unless the database host is loopback/compose-internal — demo tooling must be structurally unable to hit a real deployment.
- **The flaky-repo template** (`scripts/demo/flaky-repo/`): a minimal workflow YAML + seeded-random flaky test files + README, for the founder to push to a real public repo (suggested: `devflow-demo-flaky`) — the live-GitHub demo and a dogfood data source. In-repo we ship the template only; the real repo is a founder artifact.

### R2 — Dogfooding: DevFlow's CI produces what DevFlow eats

The repo's own CI runs 158 vitest tests and throws the results away. Wiring:

- Each of the six vitest configs gains `reporters: ['default', 'junit']` + `outputFile` (e.g. `test-results/junit.xml`, gitignored). Per-package config over a CLI flag: explicit, lands with the code it describes, and turbo's task graph stays untouched.
- `ci.yml` gains one SHA-pinned `actions/upload-artifact` step with `if: always()` — **failures must upload too**; flake detection is pointless on green-only data. The worker's scan-all-zip discovery (`scanZipForJUnit`) needs no naming convention.
- CI's service containers pull upstream `pgvector/pgvector:pg17` on GitHub runners — unaffected by this machine's local retag.
- Closing the loop is a founder step (standing since M4): install the App on this repo with a reachable deployment (local full-profile + tunnel per `github-app-setup.md`).

### R3 — Docs & diagrams from real code

`docs/architecture/system-overview.md` already carries current mermaid diagrams "as of Milestone 5". Remaining work is an M6 pass, not a rewrite:

- Add the **deployment view** (ADR-0020: two compose modes; migrate one-shot gating api/worker; ports/healthchecks; where the model lives) and an **observability** paragraph (ADR-0021: what to scrape, the DLQ gauge).
- Fix what M6 made stale (e.g. "migrations 0000–0003" → 0000–0004; package list).
- **README refresh:** status paragraph (self-hosting exists; v0.1.0), "How it _will_ work" → "How it works", a Self-hosting section pointing at `docs/self-hosting.md`, repository-layout and docs links updated (self-hosting, architecture, e2e/demo scripts).

### R4 — Release engineering (v0.1.0)

- **CHANGELOG.md** (Keep a Changelog format): one `0.1.0` entry summarized by capability area, plus an honest **Known limitations** section (single-member workspaces; JUnit XML only; GitHub Actions only; reactive rate limiting; no history backfill; metric names are API surface per ADR-0021).
- **Version:** root `package.json` 0.0.0 → 0.1.0. Workspace packages stay `private` — the release is a **git tag + GitHub Release**, nothing publishes to npm.
- **Release checklist** mapping every roadmap MVP-gate clause to its verification evidence; the founder-only clauses (real App install → live PR annotation) marked as such.
- **Demo-video storyboard** (`scripts/demo/README.md`): a scripted walkthrough over the seeded instance + the live flaky repo. Recording is the founder's; engineering delivers the script and the reproducible setup.
- Tagging `v0.1.0` (annotated) happens on `main` after this branch's PR merges — founder action.

## Explicitly out of scope (with the one big cut)

- **Installation-time backfill — recommended cut for v0.1.0** (Decision D-M6-1 below). Parked since M3; the deferral reasons still hold (run-history pagination, artifact-expiry reality — historical runs mostly have no artifacts left — and burst rate-budgeting need their own design). What changed since M3: R1 now covers the demo-data need and dogfooding accumulates real history, so backfill buys v0.1.0 almost nothing. Proposal: move to the post-MVP list with its own design step.
- Debt staying debt (recorded, not silently dropped): reactive-only rate limiting, bounded artifact pagination, C2 commitlint install scope, RLS trigger, per-identity score upserts, automated UI tests. All land in CHANGELOG "Known limitations" or stay in the handoff's debt list.
- Dependabot majors (5 PRs): recommended **after** v0.1.0 tags (majors are the wrong thing to swallow the week of a release) — D-M6-6.

## Implementation order

1. **R1 seed tooling** — biggest remaining unknown; unblocks screenshots, storyboard, and validates the fresh-database first-run experience end to end.
2. **R2 dogfood wiring** — small and independent; the sooner it merges, the sooner real history accumulates. Proves itself in this very PR's CI run (inspect the uploaded artifact).
3. **R3 docs/diagrams/README** — after features freeze, so the docs describe the final state once.
4. **R4 release artifacts** — last: CHANGELOG against the actual git history, version bump, checklist, storyboard.

Founder steps interleave without blocking: App install + dogfood deployment after R2; pushing the flaky-repo template after R1; recording after R4.

## Verification strategy

- **Per component:** R1 — scripted assertions after seeding (counts, expected verdicts incl. the always-failing-scores-zero case, search returns the planted paraphrase ranking, re-run converges byte-identically); R2 — this PR's own CI run uploads inspectable JUnit XML for all six packages, on a forced-failure test run too; R3 — mermaid renders on GitHub, links resolve, every stated number re-checked against code; R4 — CHANGELOG cross-read against `git log main..`, checklist items each carry evidence.
- **Milestone-level:** `pnpm verify` green throughout (verify-gated commits, as always); `pnpm e2e` 22/22 regression before the PR; and the capstone — **the stranger test**: a fresh clone in a scratch directory, following `docs/self-hosting.md` literally plus `pnpm demo:seed`, reaching a populated dashboard with no knowledge outside the docs.
- Nothing is claimed that is not run (NEVER-8); founder-only verifications are listed as founder steps, not asserted.

## Documentation updates (landing on this branch, before the PR)

New: `CHANGELOG.md`, `scripts/demo/README.md` (doubles as the storyboard), `scripts/demo/flaky-repo/README.md`. Updated: root `README.md`, `docs/architecture/system-overview.md`, `docs/README.md` (index lines), roadmap (M6 completion + backfill disposition), engineering-decisions (backfill cut, tag-only versioning), development-log (M6 entry at completion), handoff + session-history (every session). No new ADRs anticipated — the remaining components are tooling and release mechanics; if any implementation step surfaces an architecturally significant choice, it gets an ADR in the same change set per the standing rule.

## Founder decisions requiring approval

- **D-M6-1 — Cut backfill from v0.1.0** (move to post-MVP with its own design step). _Recommended: yes._ The alternative — a minimal backfill now — re-opens the M3 deferral reasons a week before release.
- **D-M6-2 — Ratify the seed approach** already evidenced in committed code: replay-through-pipeline via the e2e harness, with the locality guard and direct-DB workspace attachment described above.
- **D-M6-3 — Flaky-repo demo:** template lives in-repo; the founder creates the real public repo from it (name suggestion: `devflow-demo-flaky`).
- **D-M6-4 — Dogfood deployment mode:** local full-profile + tunnel for now (zero cost, matches github-app-setup.md); a VPS is a founder option later, not an M6 requirement.
- **D-M6-5 — Versioning policy:** v0.1.0 = annotated git tag + GitHub Release; root version bumped; packages stay private/unpublished.
- **D-M6-6 — Dependabot majors after the tag**, individually per D13.
- **D-M6-7 — D11 (squash vs merge commits), standing since M2:** this is the last PR before v0.1.0 — either enable squash-only + linear history in branch protection now, or amend D11 to bless merge commits. Governance call, but the release makes it timely.

## Approval

Approving this review authorizes implementation in the order above, component-by-component with verify-gated commits. Anything not listed here stays out of M6.
