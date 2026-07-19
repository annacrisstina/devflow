# ADR-0012: Workspace multi-tenancy

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** founder + lead engineer

## Context

Until now the GitHub App installation has been the tenancy root (ADR-0008, founder-approved deferral): every ingested row reaches its tenant via `repositories.installation_id`, and no user-facing surface existed to need more. M4 adds users, a dashboard and human quarantine decisions, so tenancy needs its committed shape (D8: workspace-based, Notion/Linear style — re-validated from the StudyRooms era, it survives because App installations naturally attach to a workspace-like owner). Constraints: the ingest write path must stay tenant-unaware (it predates workspaces and must keep working for unclaimed installations); pre-M4 deployments already hold data that must become claimable, not orphaned; isolation "must not depend on developer discipline alone" (architecture-context security assumptions).

## Decision

**A `workspaces` table is the tenant. Workspaces own installations; everything downstream resolves its tenant at read time through `repositories.installation_id → installations.github_installation_id → installations.workspace_id`.**

- **Schema (migration 0003):** `workspaces`; `workspace_members` (role `owner|member`, unique per (workspace, user)); `installations` (unique `github_installation_id`, **nullable** `workspace_id`, nullable account fields, `uninstalled_at`); Auth.js tables (`users`, `accounts`, `sessions`, `verification_tokens` — ADR-0013). Auth.js tables use **text UUID ids** (the adapter models ids as strings end-to-end); all other tables keep bigint identities. Ingestion tables are untouched — tenancy is never written into the ingest path.
- **Unclaimed installations are first-class:** `workspace_id IS NULL` means webhooks flow and data accrues, but no workspace sees it yet. The migration **backfills** an unclaimed row per distinct `repositories.installation_id`, so pre-M4 history becomes claimable.
- **Claiming is exclusively the signed-state install redirect:** the dashboard's "Connect GitHub" link is `github.com/apps/<slug>/installations/new?state=<HMAC-signed {workspaceId, userId, exp}>`; GitHub passes `state` through to the App's Setup URL (`/api/github/setup`), which verifies the signature and binds the installation. GitHub itself enforces that only someone with rights on the target account can complete an installation; our state binds the result to a workspace the initiating user belongs to. Residual risk accepted: someone handed a claim link can install _their own_ repos into that workspace — they harm only themselves.
- **Isolation is application-layer, enforced at two chokepoints:** every `/api/v1` route resolves session → membership via a shared preHandler (non-membership → **404**, no existence oracle), and data access takes `workspaceId` as a required argument. The "not discipline alone" guard is a **cross-tenant denial integration test for every endpoint** on real Postgres.
- **M4 ships single-member workspaces.** The members table and role column make teams a feature, not schema surgery; there is no invite flow (needs email or link infrastructure — post-MVP).
- **Uninstall (`installation.deleted`) sets `uninstalledAt`**, never deletes: ingested history must not be silently orphaned by an uninstall click.

## Alternatives considered

- **Row-level security (RLS)** — rejected _for now_, with an explicit trigger: adopt before any deployment hosting mutually-untrusting tenants. Until then the dogfood/demo instance is effectively single-workspace, and RLS with Drizzle + pooled connections means transaction-wrapping every request for `SET LOCAL` — complexity purchased against a threat model that does not exist yet. Same reasoning class as rejecting Kafka (ADR-0007) and partitioning (ADR-0008).
- **`workspace_id` denormalized onto `repositories` (or deeper)** — rejected: writes tenancy into the ingest path, which must keep working for unclaimed installations, and creates a second source of truth for ownership that claim/unclaim would have to keep consistent.
- **Per-user tenancy** — rejected in D8 already: kills the team story that the members table now makes cheap.
- **Auto-created personal workspace on first login** — rejected: magic that hides the workspace concept; one explicit create screen is cheaper than implicit-state bugs.
- **Claiming via GitHub org-membership lookups** (match installations to users by API) — rejected: a real permission surface and rate budget for a flow the signed redirect provides for free.
- **Bigint ids for Auth.js tables** — rejected: the adapter contract models ids as strings; fighting it buys nothing and risks subtle adapter bugs.

## Consequences

- The M4 API surface always scopes by workspace; queries join through `installations`, one more hop than installation-rooted queries — acceptable at MVP scale, and the join is indexed on both ends.
- Backfilled installation rows carry only the numeric id until an `installation` event or a claim fills account fields; the UI falls back to repository owner names — an honest, stated gap.
- Deleting a workspace is out of scope (no endpoint); the FK graph makes it deliberately awkward until a real retention design (M6+) decides what deletion means for ingested history.
- RLS adoption later is additive: the schema already carries the ownership chain it would enforce.
