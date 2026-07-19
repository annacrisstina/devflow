# @devflow/web

The DevFlow dashboard: a Vite + React SPA — GitHub login (via the API's Auth.js mount), workspace and repository views, the flakiest-tests ranking (decayed scores, ADR-0014), a live run feed (Socket.IO, ADR-0015) and the quarantine workflow (ADR-0016).

**Boundaries:** talks to the backend exclusively through `/api/v1` and the Socket.IO stream, typed by `@devflow/contract` — it never imports from `apps/api` or touches the database. All state it renders is server state (TanStack Query); live events only trigger refetches, never local mutations of truth.

**Dev:** `pnpm --filter @devflow/web dev` serves on `127.0.0.1:5173` and proxies `/api` + `/socket.io` to the API on `:3001` — one origin, so the session cookie just works. **Prod:** `pnpm --filter @devflow/web build` emits `dist/`, which the API serves when `DEVFLOW_WEB_DIST` points at it (same origin, no CORS anywhere).

UI testing is deliberately minimal per the project testing philosophy (API contract tests carry correctness); `pnpm verify` type-checks and builds this app, and the milestone's browser walkthrough is the functional check.
