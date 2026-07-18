# @devflow/db

Database schema, migrations and connection factory. The single owner of "what the database looks like" — no other package defines tables or writes DDL.

## Responsibility

- Drizzle table definitions (`src/schema/`), one file per table group.
- Generated, committed, forward-only SQL migrations (`migrations/`).
- `createDbClient(connectionString)` — the pg pool + Drizzle instance apps use.

## Boundaries

- **No business logic.** Queries live with the code that needs them (apps); this package only defines the shapes they query.
- Never imports from `apps/*` (dependency direction: apps → packages, never the reverse).

## Workflow

```sh
pnpm --filter @devflow/db db:generate   # schema change → new SQL migration (review it!)
pnpm --filter @devflow/db db:migrate    # apply committed migrations (DEVFLOW_DATABASE_URL or compose default)
pnpm --filter @devflow/db test          # integration tests against a throwaway devflow_test database
```

Migrations are forward-only: a wrong migration is corrected by a new migration, never by editing an applied one.
