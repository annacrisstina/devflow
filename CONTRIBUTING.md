# Contributing to DevFlow

Thanks for your interest. This document describes how the project is developed — the same rules apply to maintainers and external contributors. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

1. Install Node.js 22 LTS (`nvm use` reads `.nvmrc`) and enable pnpm: `corepack enable`.
2. Start local infrastructure: `docker compose up -d` (Postgres with pgvector + Redis).
3. `pnpm install`
4. `pnpm verify` — must pass before you start and before every push.

Run `./scripts/doctor.sh` if anything misbehaves; it checks your toolchain against the project's requirements.

## Branch strategy: GitHub Flow

- `main` is always releasable and is protected — no direct pushes, PRs only.
- Branch from `main`, keep branches short-lived (days, not weeks).
- Branch names: `<type>/<short-kebab-description>`, e.g. `feat/webhook-hmac-verification`, `fix/junit-parser-crash`, `docs/adr-queue-choice`. Types match commit types below.
- PRs are merged with **squash merge** — history on `main` stays linear, one commit per PR, and the PR title becomes the commit subject (so PR titles must follow Conventional Commits too).

## Commit convention: Conventional Commits

Format: `type(scope): imperative summary` — enforced by commitlint in CI.

| Type       | Use for                                         |
| ---------- | ----------------------------------------------- |
| `feat`     | User-visible functionality                      |
| `fix`      | Bug fixes                                       |
| `docs`     | Documentation only (including ADRs)             |
| `refactor` | Code change that is neither a feature nor a fix |
| `test`     | Adding or correcting tests                      |
| `chore`    | Tooling, dependencies, repo maintenance         |
| `ci`       | CI pipeline changes                             |
| `perf`     | Performance improvements                        |

Allowed scopes are defined in `commitlint.config.mjs` and documented in [docs/conventions.md](docs/conventions.md). Example: `feat(ingest): verify webhook signatures before enqueueing`.

## Pull requests

- Keep PRs small and single-purpose; a reviewer should get through one in under 15 minutes.
- Fill in the PR template — especially **how you verified** the change.
- CI must be green (format, lint, typecheck, build, tests, commitlint).
- Any architecturally significant decision (new dependency, new service, new pattern) requires an ADR in the same PR — see [docs/adr/template.md](docs/adr/template.md).

## Code style

Style is enforced by tooling, not by review comments: Prettier formats, ESLint lints, `.editorconfig` covers the rest. If a rule is wrong, change the rule in a PR — don't fight it inline. Naming and design conventions live in [docs/conventions.md](docs/conventions.md).
