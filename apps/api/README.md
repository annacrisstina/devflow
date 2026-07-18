# @devflow/api

The HTTP surface of DevFlow: GitHub webhook ingestion and (in later milestones) the REST API the web UI consumes.

## Responsibility

- `POST /webhooks/github` — HMAC-verified, idempotent ingestion of GitHub deliveries into the raw `webhook_events` table. Verify → persist → fast ACK; nothing expensive happens in-request.
- `GET /healthz` — liveness + database reachability.

## Boundaries

- Consumes `@devflow/db` for schema and connection; owns its own queries (queries live with the code that needs them).
- Never imports from other apps.
- The ingestion pipeline ends at "raw row persisted" in M1; queue dispatch is added in M2.

## Running locally

```sh
docker compose up -d          # repo root: Postgres + Redis
pnpm --filter @devflow/db db:migrate
pnpm --filter @devflow/api dev
curl http://127.0.0.1:3001/healthz
```

Configuration is environment-only (see `.env.example` at the repo root); a missing `.env` falls back to defaults that match `compose.yaml`.
