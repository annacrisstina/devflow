# ADR-0013: Auth.js on Fastify with database sessions

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** founder + lead engineer

## Context

M4 is the first user-facing surface, so user login lands now (D3, committed since project start: Auth.js with the GitHub provider, sessions in our Postgres). The user base is developers with GitHub accounts — GitHub OAuth is the only sensible login, and there are no passwords to get wrong. Constraints: the API (Fastify, ADR-0004) must be the process that enforces auth — the SPA is same-origin behind it; self-hosting forbids managed identity providers; the session store must be ours (revocation, and interview material for owning the table without hand-rolling credential auth). Complication: Auth.js ships official bindings for Next.js/Express/SvelteKit — **not Fastify**. This was the milestone's riskiest unknown and was implemented first, as a spike, with a pre-agreed fallback (hand-rolled GitHub OAuth code flow against the same session table) that would have required founder sign-off before use. The spike succeeded; the fallback was not needed.

## Decision

**Mount `@auth/core` — the framework-agnostic engine under every Auth.js binding — directly on Fastify at `/api/auth/*`, with the Drizzle adapter and the database session strategy.**

- **The shim is ~40 lines** (`apps/api/src/auth/authjs-plugin.ts`), the same pattern as the official `@auth/express` package: Fastify request → Fetch `Request`, `Auth(request, config)` → Fetch `Response` → Fastify reply (Set-Cookie kept one-header-per-cookie). Form posts reach Auth.js as raw bytes via a plugin-scoped content-type parser — the same encapsulation trick as the webhook route's raw-body parser.
- **Database sessions, not JWTs:** the cookie value is the `sessions.session_token` row key. Sign-out and revocation are row deletes; there is no signed-token invalidation problem. Owning the session table was D3's stated motivation.
- **API request authentication is a direct indexed join** (`apps/api/src/auth/session.ts`): cookie → `sessions ⋈ users` with an expiry check — no round-trip through the Auth.js handler on every API call. The cookie names (`authjs.session-token` / `__Secure-` prefixed) are Auth.js's documented contract; the dependency is accepted and noted here.
- **OAuth client = the GitHub App itself.** A GitHub App carries its own OAuth credentials ("Request user authorization"); reusing them means one GitHub-side identity, no second OAuth App to register or document. User login (this ADR) stays distinct from App-installation auth (ADR-0009's JWT → installation tokens) — different credentials, different processes, different purposes.
- **Guards:** `requireSession` (401) and `requireWorkspaceMember` (404 on non-membership — no existence oracle) are the preHandler chokepoint of ADR-0012's isolation model.
- **URL construction uses `DEVFLOW_APP_URL`**, not the Host header, so callback URLs are stable behind any proxy; `trustHost` is set because the deployment's base URL is explicit config.

## Alternatives considered

- **Hand-rolled GitHub OAuth code flow** (the spike's fallback) — viable (no passwords, ~150 lines) but reimplements CSRF/state/cookie handling Auth.js has hardened, and amends a committed decision without a technical forcer. Kept documented as the exit if `@auth/core` internals ever fight Fastify.
- **JWT session strategy** — rejected: revocation requires denylists, and it abandons the owned session table for no gain at our scale.
- **Auth.js hosted in the web app (Next-style)** — rejected: splits auth enforcement from the API process that guards every route; D2 already rejected the Next server for erasing the backend/frontend boundary.
- **Clerk / Supabase Auth / managed IdPs** — rejected in D3: managed dependency contradicts `docker compose up` self-hosting.
- **`fastify-next-auth` style community wrappers** — rejected: thin wrappers over the same `@auth/core` with an extra maintainer between us and the engine; the shim is smaller than the dependency.

## Consequences

- Login UX: the SPA links to Auth.js's minimal hosted sign-in page (`/api/auth/signin`); custom-branded login is deliberately deferred (UI polish is lowest MVP priority).
- CSRF: Auth.js protects its own endpoints; `/api/v1` mutations rely on `SameSite=Lax` session cookies (cross-site POSTs don't carry them) — accepted for MVP, revisit if the API ever accepts cross-origin browser calls.
- The `@auth/core` version is pinned in lockstep with `@auth/drizzle-adapter`'s own dependency (0.41.x) — version skew between the two is the known failure mode of this stack.
- A future email/magic-link provider would need SMTP infrastructure but no migration: the adapter's full table set (including `verification_tokens`) exists from day one.
- Live verification against real GitHub requires the App's OAuth credentials in `.env` — a founder step (client secret generation, github-app-setup.md).
