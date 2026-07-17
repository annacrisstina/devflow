# packages/

Internal shared packages, published nowhere — consumed only via the pnpm workspace protocol (`workspace:*`). Each package has a single responsibility, a README documenting it, and an explicit dependency direction: packages never import from `apps/*`.

Planned (added when first needed, not scaffolded in advance):

- `@devflow/db` — Drizzle schema, migrations, query helpers.
- `@devflow/domain` — domain types and pure business logic (no I/O).
- `@devflow/config-typescript` / `@devflow/config-eslint` — shared tool configuration, extracted once more than one package needs it.
