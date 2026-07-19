# packages/

Internal shared packages, published nowhere — consumed only via the pnpm workspace protocol (`workspace:*`). Each package has a single responsibility, a README documenting it, and an explicit dependency direction: packages never import from `apps/*`.

Current:

- [`@devflow/db`](db/README.md) — Drizzle schema, migrations, connection factory.
- [`@devflow/queue`](queue/README.md) — the api↔worker Redis contract: job payloads, retry policy, connection factory, the live-events channel.
- [`@devflow/contract`](contract/README.md) — type-only wire contract between api and web (`/api/v1` DTOs, live-event envelopes).
- [`@devflow/ai`](ai/README.md) — the amputable AI layer (ADR-0017): local embedder, failure-text hashing, clustering, LLM provider seam.

Planned (added when first needed, not scaffolded in advance):

- `@devflow/domain` — domain types and pure business logic (no I/O).
- `@devflow/config-typescript` / `@devflow/config-eslint` — shared tool configuration, extracted once more than one package needs it.
