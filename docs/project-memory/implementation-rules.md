# Implementation Rules

> Part of the [project memory](../README.md#project-memory). The working agreement between the founder and any engineer (human or AI) implementing DevFlow. These rules were set explicitly at project start and survived the Milestone 0 readiness review. Changing them requires the founder's explicit consent, not convenience.

## Milestone workflow (mandatory, every milestone)

1. **Explain the goal** — what the milestone delivers and why now.
2. **Explain the design decisions** — with alternatives and trade-offs, before any file is written.
3. **Generate the files** — incrementally, never the whole project at once.
4. **Explain and RUN the verification** — verification means executing commands and reporting real output, not describing what should happen.
5. **Suggest the git commit** — commitlint-valid message, content staged.
6. **Wait for the founder's confirmation** before starting the next milestone.

Additional constraints:

- Every milestone leaves the repository in a **working state** (`pnpm verify` green, compose healthy).
- Every architecturally significant decision in a milestone ships with its ADR **in the same change set**.
- Work happens milestone by milestone; no speculative scaffolding for future milestones (directories-with-intent READMEs are the allowed placeholder form).

## Milestone completeness & attribution (founder amendment, 2026-07-18, post-M2)

- **A milestone is complete only when code, tests, ADRs, project memory, development log and session notes are ALL updated and ready for review** — documentation lands alongside the code it documents, on the same branch, before the PR opens.
- **No separate post-merge documentation branches** unless a significant new event occurs that could not reasonably have been documented before the merge (the M2 post-merge closeout was the motivating case; its content folds into the next feature branch).
- **Commit hygiene:** Conventional Commits only; small, logically separated commits; **no `Co-Authored-By` trailers or AI attribution in commit messages** (standing founder directive; the M2 pre-push history rewrite enforced it retroactively).

## Review workflow

- Formal **readiness reviews** happen at the founder's request and are adversarial by design: findings are categorized BLOCKER / MAJOR / MINOR / NIT, and a milestone is not approved while blockers exist.
- Reviews are re-verified **from scratch** — previous findings are never assumed fixed; each is re-checked against the actual repository state with evidence.
- Review findings get fixed before the next milestone starts (PR-cannot-merge-with-blockers discipline).
- Self-review must have teeth: a review that finds nothing in one's own work is treated as a failed review.

## Architecture-first philosophy

- Design decisions are stated, challenged and recorded **before** implementation.
- Product design is **locked** (see project-overview.md); engineering may challenge product decisions only with a concrete technical blocker, and the choice-of-project question is closed (re-litigated three times, resolved; a fourth reopening requires a technical impossibility, not a better idea).
- The role split: the founder decides; the implementing engineer recommends decisively (one defended option, not menus) and pushes back with technical arguments when warranted.

## Coding philosophy

- TypeScript `strict: true` everywhere; `any` requires an inline justification comment.
- No default exports (ESLint-enforced; config files exempt).
- Errors are values at I/O boundaries; `throw` is for programmer error and unrecoverable states.
- No barrel files inside packages.
- Comments state constraints the code can't express — never narrate what the next line does.
- Match the conventions of surrounding code; when a rule is wrong, change the rule in a PR rather than deviating silently.
- Full conventions: [../conventions.md](../conventions.md).

## Repository standards

- Layout: `apps/*` deployables, `packages/*` shared internals, `docs/` knowledge, `scripts/` tooling.
- Dependency direction: apps → packages, never apps → apps, never packages → apps.
- Every package/app has a README stating its single responsibility and boundaries.
- Naming: kebab-case files, `@devflow/<name>` packages, snake_case plural DB tables (full table in conventions.md).

## Documentation standards

- ADRs: Nygard format, numbered, immutable once accepted, superseded rather than edited ([ADR-0001](../adr/0001-record-architecture-decisions.md)).
- Project memory (`docs/project-memory/`) is updated whenever an important engineering decision is made.
- [development-log.md](../development-log.md) gets an entry after **every** milestone.
- [implementation-handoff.md](../session-notes/implementation-handoff.md) is updated at the end of **every** working session.
- Documentation lies are bugs: docs that contradict the code get fixed in the same PR that exposes the contradiction.

## Git workflow

- **GitHub Flow:** `main` protected and always releasable; no direct pushes; PRs only.
- Branches: `type/short-kebab-description` (e.g. `feat/webhook-hmac-verification`), short-lived.
- **Squash merge only** → linear history; PR title becomes the `main` commit subject and is therefore commitlint-checked in CI.
- Branch protection on GitHub (manual setting, pending first push): require PR, require `quality` + `commitlint` checks, linear history.

## Commit conventions

- Conventional Commits, enforced by commitlint (CI): `type(scope): imperative summary`.
- Types: feat, fix, docs, refactor, test, chore, ci, perf.
- Scopes (strict enum, sync with `commitlint.config.mjs`): repo, ci, docs, api, web, ingest, worker, db, shared, deps.

## Quality gates

- `pnpm verify` = format:check + lint + typecheck + build + test — identical locally and in CI. Green locally must mean green remotely.
- CI additionally validates the compose file and commit messages/PR titles.
- Gates must be honest: while a gate is vacuous (e.g. `test` with no packages yet), that fact is stated openly (currently footnoted in README) rather than hidden behind a green badge.

## Testing philosophy

- Tests land **with the code they test**, not as a later milestone.
- Priority order: (1) the ingestion path (HMAC verification, idempotency, parser correctness — this is the product's spine), (2) the detection engine (statistical logic with fixture histories), (3) API contracts. UI testing is lowest priority in MVP.
- Real fixtures over mocks where the boundary is external data: recorded GitHub webhook payloads and real JUnit XML files are the test corpus.
- E2E on the critical path (webhook received → result stored → score computed) once that path exists.
- Coverage numbers are not a goal; untested-critical-path is a blocker, untested-glue is acceptable and stated.

## The NEVER list — explicit standing prohibitions

1. **Never generate the whole project at once** — milestone by milestone, always.
2. **Never skip an architectural decision** or bury one inside an implementation commit without ADR/memory trail.
3. **Never implement business logic before its design is agreed** in the milestone's decision step.
4. **Never let AI decide** quarantine, flakiness verdicts, or any state change in the product — AI assists, humans decide (product invariant).
5. **Never commit secrets** — `.env` stays gitignored; keys live in env vars; the GitHub App private key never enters the repo.
6. **Never push directly to `main`** once the repo is on GitHub — PRs only.
7. **Never use mutable action tags in CI** — full SHA pins with version comments.
8. **Never claim verification that wasn't run** — "it should work" is not a verification result.
9. **Never reopen the choice-of-project question** without a concrete technical blocker.
10. **Never scaffold speculative future code** ("we'll need it later" is not a reason; the milestone that needs it creates it).
11. **Never break `docker compose up` self-hosting** by introducing managed-only dependencies.
12. **Never merge with an unresolved review blocker.**
