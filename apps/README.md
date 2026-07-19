# apps/

Deployable applications. Each subdirectory is an independently runnable unit with its own `package.json`, README and deployment story. Apps may depend on `packages/*`; apps must never import from other apps.

Current:

- [`api`](api/README.md) — HTTP server: GitHub webhook ingestion endpoint, `/api/v1` REST surface, Auth.js login, Socket.IO gateway.
- [`worker`](worker/README.md) — background workers: artifact download, JUnit parsing, flakiness scoring, PR annotation, live-event publishing.
- [`web`](web/README.md) — the dashboard SPA (workspaces, flakiest-tests ranking, live runs, quarantine).
