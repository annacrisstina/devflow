# ADR-0003: Drizzle ORM for database access

- **Status:** Accepted
- **Date:** 2026-07-18
- **Deciders:** founder + lead engineer

## Context

Milestone 1 introduces the first database code: an append-only table for raw GitHub webhook deliveries, with more schema (normalized runs, test results, scores) arriving in every following milestone. We need a way to define schema, generate and apply migrations, and query Postgres from TypeScript.

Two forces dominate. First, Postgres is the single source of truth for this product (relational data, derived scores, pgvector embeddings), so the database layer will be touched by every milestone — a wrong choice here compounds. Second, a project goal is that the founder can discuss SQL, query plans, indexes and migrations fluently in interviews; a tool that hides SQL works against the project's purpose even when it works as software.

## Decision

We will use **Drizzle ORM** with the **node-postgres (`pg`)** driver, and **drizzle-kit** for migration generation.

- Schema is TypeScript in `packages/db/src/schema/`, the single owner of DDL.
- Migrations are generated SQL, committed to the repo, human-reviewed like any code, and **forward-only** — a wrong migration is corrected by a new migration, never edited after applying.
- Query code lives with the features that need it (in apps); `@devflow/db` exports only schema and a connection factory.

## Alternatives considered

- **Prisma** — the mainstream choice, but it abstracts SQL behind its own schema language and query engine. Exactly the knowledge this project must keep exercised (visible SQL, explainable query plans) is what Prisma hides. Also historically awkward around Postgres-specific features (identity columns, extensions like pgvector) that we use from day one.
- **Kysely** — an excellent type-safe query builder, but it is only a query builder: schema definition and migration generation would need separate tooling or hand-rolling, i.e. more moving parts for the same outcome Drizzle covers in one tool.
- **Raw SQL + `pg`** — maximum visibility, but hand-written result types drift from actual DDL, and hand-rolled migration bookkeeping is precisely the undifferentiated machinery a well-scoped tool should own. The cost buys no additional learning beyond what reviewing generated SQL already provides.
- **node-postgres vs postgres.js as driver:** `pg` chosen for its maturity, pool semantics, and universal ecosystem support; no feature of postgres.js is load-bearing for us.

## Consequences

- SQL stays visible end to end: table definitions read like DDL, every migration is reviewable SQL in the diff, and Drizzle queries map 1:1 to the SQL they emit.
- Type safety from schema to query results without a code-generation step disconnected from the source (the TS schema _is_ the source).
- We accept drizzle-kit's generated-migration workflow, including its snapshot files in `migrations/meta/` — machine-managed JSON that must be committed but never hand-edited.
- Drizzle is younger than Prisma; API churn between minor versions is a real (observed) risk, mitigated by lockfile pinning and Dependabot's individual-major-PR policy.
- Forward-only migrations mean no down scripts; recovery from a bad migration in development is "recreate the database", which the integration test suite already does on every run.
