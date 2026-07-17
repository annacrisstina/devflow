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

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint in CI. Types are documented in [CONTRIBUTING.md](../CONTRIBUTING.md).

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

## Branch strategy

GitHub Flow, described in [CONTRIBUTING.md](../CONTRIBUTING.md#branch-strategy-github-flow): protected `main`, short-lived `type/kebab-description` branches, squash merges, linear history.

## Development environment

- Stateful backing services (Postgres, Redis) run in Docker via `compose.yaml`; application code runs natively via `pnpm dev` for fast feedback and debuggability.
- Configuration comes exclusively from environment variables (12-factor). `.env.example` is the always-up-to-date template; `.env` is gitignored and never committed.
- `pnpm verify` is the single command that answers "is my working tree healthy?" — CI runs exactly the same thing, so green locally means green remotely.

## Documentation

- Architecturally significant decisions → ADR (see [ADR-0001](adr/0001-record-architecture-decisions.md)).
- Every package and app gets a README stating its single responsibility and its boundaries (what it must never import).
