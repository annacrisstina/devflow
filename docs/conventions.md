# Engineering conventions

The rules of the road for this repository. Tooling enforces most of them (Prettier, ESLint, commitlint, `.editorconfig`); this document explains the intent and covers what tools can't check.

## Naming

| Thing                    | Convention                       | Example                    |
| ------------------------ | -------------------------------- | -------------------------- |
| Files and directories    | `kebab-case`                     | `flakiness-score.ts`       |
| Variables, functions     | `camelCase`                      | `computeFlakinessScore`    |
| Types, classes, enums    | `PascalCase`                     | `WorkflowRunEvent`         |
| Constants (module-level) | `SCREAMING_SNAKE_CASE`           | `MAX_RETRY_ATTEMPTS`       |
| Environment variables    | `SCREAMING_SNAKE_CASE`, prefixed | `DEVFLOW_GITHUB_APP_ID`    |
| Packages                 | `@devflow/<kebab-name>`          | `@devflow/db`              |
| Database tables/columns  | `snake_case`, tables plural      | `test_results.workflow_id` |

## TypeScript standards

- `strict: true` everywhere, no exceptions and no `any` without an inline comment explaining why.
- **No default exports** (ESLint-enforced): named exports survive renames, autocomplete better and grep cleanly. Config files that tools require to default-export are the only exception.
- Prefer `type` for data shapes, `interface` only when declaration merging is the point.
- Errors are values at boundaries: external I/O (GitHub API, DB, queue) returns typed results; `throw` is reserved for programmer error and truly unrecoverable states.
- No barrel files (`index.ts` that only re-exports) inside packages — they hide the dependency graph and break tree-shaking.

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint in CI. Format: `type(scope): imperative summary` — e.g. `feat(ingest): verify webhook signatures before enqueueing`.

### Commit types

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

### Commit scopes

Kept in sync with `commitlint.config.mjs`:

| Scope    | Covers                                        |
| -------- | --------------------------------------------- |
| `repo`   | Repository-wide tooling, structure, standards |
| `ci`     | GitHub Actions pipeline                       |
| `docs`   | Documentation, ADRs                           |
| `api`    | API server app                                |
| `web`    | Web UI app                                    |
| `ingest` | Webhook ingestion                             |
| `worker` | Background workers                            |
| `db`     | Database schema, migrations                   |
| `shared` | Shared packages                               |
| `deps`   | Dependency updates                            |

## Branch strategy: GitHub Flow

- `main` is always releasable and is protected — no direct pushes, PRs only.
- Branch from `main`, keep branches short-lived (days, not weeks).
- Branch names: `<type>/<short-kebab-description>`, e.g. `feat/webhook-hmac-verification`, `fix/junit-parser-crash`, `docs/adr-queue-choice`. Types match commit types above.
- PRs are merged with **squash merge** — history on `main` stays linear, one commit per PR, and the PR title becomes the commit subject (so PR titles must follow Conventional Commits too).

### Pull requests

- Keep PRs small and single-purpose; a review pass should get through one in under 15 minutes.
- Fill in the PR template — especially **how the change was verified**.
- CI must be green (format, lint, typecheck, build, tests, commitlint).
- Any architecturally significant decision (new dependency, new service, new pattern) requires an ADR in the same PR — see the [ADR template](adr/template.md).

## Development environment

- Stateful backing services (Postgres, Redis) run in Docker via `compose.yaml`; application code runs natively via `pnpm dev` for fast feedback and debuggability. (The same file's `full` profile containerizes the apps for self-hosting — ADR-0020, [self-hosting.md](self-hosting.md) — and changes nothing about the dev default.)
- Configuration comes exclusively from environment variables (12-factor). `.env.example` is the always-up-to-date template; `.env` is gitignored and never committed.
- `pnpm verify` is the single command that answers "is my working tree healthy?" — CI runs exactly the same thing, so green locally means green remotely.

## Documentation

- Architecturally significant decisions → ADR (see [ADR-0001](adr/0001-record-architecture-decisions.md)).
- Every package and app gets a README stating its single responsibility and its boundaries (what it must never import).
