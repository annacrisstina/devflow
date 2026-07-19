# Self-hosting DevFlow

One command runs the whole product in containers (ADR-0020): Postgres (pgvector), Redis, a one-shot migration runner, the API (serving the dashboard) and the worker. This guide targets "a stranger can run this" — no pnpm, no Node on the host, just Docker.

Developing instead of deploying? Ignore this file: plain `docker compose up` still starts only the dev infrastructure, and the apps run natively (`pnpm dev`, [conventions.md](conventions.md#development-environment)).

## Prerequisites

- Docker Engine 24+ with the compose plugin (or Docker Desktop).
- A GitHub App for your deployment — created once, by you, following [github-app-setup.md](github-app-setup.md) (steps 1, 3, 3b, 4). The App carries the webhook secret, the OAuth login credentials and the private key the worker uses to read artifacts.
- A URL GitHub can reach for webhooks and OAuth callbacks: a public domain in production, or a tunnel (smee.io, cloudflared) for a private box.

## 1. Configure

```bash
git clone https://github.com/annacrisstina/devflow.git && cd devflow
cp .env.example .env
```

Fill in `.env`. The full profile requires exactly the values the apps' boot validation demands:

| Variable                                                          | Source                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `DEVFLOW_GITHUB_WEBHOOK_SECRET`                                   | `openssl rand -hex 32`, pasted into the App's webhook settings                             |
| `DEVFLOW_AUTH_SECRET`                                             | `openssl rand -hex 32` (≥ 32 chars)                                                        |
| `DEVFLOW_GITHUB_CLIENT_ID` / `DEVFLOW_GITHUB_CLIENT_SECRET`       | the App's OAuth credentials (setup guide §3b)                                              |
| `DEVFLOW_GITHUB_APP_SLUG`                                         | the App's URL name                                                                         |
| `DEVFLOW_GITHUB_APP_ID` / `DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64` | the App settings page; `base64 -w0 key.pem`                                                |
| `DEVFLOW_APP_URL`                                                 | the public base URL of this deployment                                                     |
| `DEVFLOW_AI_API_KEY`                                              | optional — leave unset and AI hypotheses are cleanly off (ADR-0019); everything else works |

`POSTGRES_PASSWORD` defaults to a local-only value; set your own for anything reachable.

## 2. Run

```bash
docker compose --profile full up -d --build
```

First build compiles the workspace and bakes the ~25 MB embedding model into both app images (ADR-0018/0020) — allow a few minutes. Then:

```bash
docker compose --profile full ps    # postgres, redis: healthy; migrate: exited (0); api, worker: healthy
```

The dashboard is at `http://127.0.0.1:3001`. Sign in with GitHub, click **Connect GitHub**, install the App on a repository, and pushes start flowing: runs ingested → JUnit parsed → flakiness scored → PR checks annotated.

## 3. Expose it

The API publishes on loopback by default. For a real deployment put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front of port 3001 and set in `.env`:

```bash
DEVFLOW_APP_URL=https://devflow.example.com
DEVFLOW_TRUST_PROXY=on          # trust the proxy's forwarded headers
# DEVFLOW_API_PUBLISH=3001      # only if the proxy runs on another host
```

The proxy must pass WebSocket upgrades (the live feed, ADR-0015). Point the GitHub App's webhook URL at `https://devflow.example.com/webhooks/github` and its callback URL at `https://devflow.example.com/api/auth/callback/github`.

`/metrics` on the API port is unauthenticated by design (ADR-0021): allow only your monitoring network at the proxy. The worker's health/metrics port never leaves the compose network.

## Operations

- **Upgrade:** `git pull && docker compose --profile full up -d --build` — the migrate service re-runs pending migrations before the apps start; a failed migration halts the rollout with the apps unstarted.
- **Backup:** the state lives in the `postgres-data` volume (`docker exec devflow-postgres pg_dump -U devflow devflow > backup.sql`). Redis holds only in-flight queue jobs — losing it costs at most work GitHub will redeliver.
- **Logs:** `docker compose logs -f api worker` — structured JSON, correlated by delivery GUID.
- **Monitoring:** scrape `/metrics` on both processes (ADR-0021); the alertable number is `devflow_queue_jobs{state="failed"}` — the dead-letter queue.
- **Air-gapped:** works as-is; the embedding model is baked into the images at build time, and without `DEVFLOW_AI_API_KEY` nothing ever calls out except the GitHub API.

## Troubleshooting

- `migrate` exited non-zero → `docker compose logs migrate`; the apps deliberately did not start.
- `api` unhealthy → almost always missing/short `.env` secrets; `docker compose logs api` prints the exact boot-validation failure.
- Webhooks arrive but nothing happens → check `docker compose logs worker` and the App's **Advanced → Recent Deliveries** tab; redelivery is always safe (idempotent ingestion, ADR-0005).
