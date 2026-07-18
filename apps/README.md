# apps/

Deployable applications. Each subdirectory is an independently runnable unit with its own `package.json`, README and deployment story. Apps may depend on `packages/*`; apps must never import from other apps.

Current:

- [`api`](api/README.md) — HTTP server: GitHub webhook ingestion endpoint, REST API, WebSocket gateway.

Planned (added milestone by milestone, not scaffolded in advance):

- `worker` — background workers: artifact download, JUnit parsing, flakiness scoring.
- `web` — the web UI.
