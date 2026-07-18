# GitHub App setup

DevFlow integrates with GitHub as a **GitHub App** (why not an OAuth App: [ADR-0006](adr/0006-github-app-not-oauth-app.md)). This guide creates the app for local development and wires its webhooks to a dev machine. It is a one-time, manual step performed by the repository owner — nothing here is automated on purpose (app creation grants credentials; a human should see every screen).

## 1. Generate a webhook secret

```sh
openssl rand -hex 32
```

Keep the value at hand; it goes in two places (GitHub App form + local `.env`) and must match exactly.

## 2. Create a webhook tunnel channel

Webhooks need a public URL; the dev API listens on loopback. [smee.io](https://smee.io) is the tunnel (any equivalent — `cloudflared`, `ngrok` — works the same way):

- Open <https://smee.io/new>; it redirects to a fresh channel URL like `https://smee.io/AbCdEfGh123`. Save it.
- The channel URL is effectively public — anyone who has it can POST junk into your tunnel. That junk dies at HMAC verification (this is why signature checking is active in dev too), but treat the URL as semi-private anyway and rotate channels freely; nothing persists on smee.

## 3. Create the GitHub App

GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**:

| Field                                   | Value                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| GitHub App name                         | `devflow-dev-<username>` (name is globally unique; suffix avoids collisions) |
| Homepage URL                            | your fork/repo URL                                                           |
| Webhook → Active                        | ✅                                                                           |
| Webhook URL                             | the smee channel URL from step 2                                             |
| Webhook secret                          | the secret from step 1                                                       |
| Permissions → Repository → **Actions**  | Read-only                                                                    |
| Permissions → Repository → **Checks**   | Read and write (M3+ — PR annotation, ADR-0011)                               |
| Permissions → Repository → **Metadata** | Read-only (mandatory anyway)                                                 |
| Subscribe to events                     | **Workflow run**                                                             |
| Where can this app be installed?        | Only on this account                                                         |

Everything else stays off. Least privilege is deliberate: that friction of adding permissions late is the honest cost of not asking for them before needing them. **If your App predates M3:** add Checks: read-and-write on the App's Permissions & events page, then approve the permission request on each installation (Settings → Installations) — until approved, annotation jobs fail with 403 and retry into the DLQ while ingestion and scoring continue unaffected (ADR-0011). `installation` / `installation_repositories` lifecycle events are delivered to apps automatically, no subscription needed.

**Private key (needed from M2 on):** on the App's settings page, generate a private key — GitHub downloads a PKCS#1 PEM file. It is the system's highest-value secret: never enters the repo, lives only in `.env`, base64-encoded:

```sh
# .env
DEVFLOW_GITHUB_APP_ID=<App ID, shown at the top of the App settings page>
DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64=$(base64 -w0 ~/Downloads/devflow-dev.*.private-key.pem)
```

(M1 deliberately skipped this — no key existed while nothing called the GitHub API.)

## 4. Install the app

App page → **Install App** → your account → select the repository (or a scratch repo with a workflow, for testing). GitHub immediately sends `installation` events — first proof the pipe works.

## 5. Run the local loop

```sh
# terminal 1 — infra + migrations (repo root)
docker compose up -d
pnpm --filter @devflow/db db:migrate

# .env at repo root (gitignored):
#   DEVFLOW_GITHUB_WEBHOOK_SECRET=<secret from step 1>

# terminal 2 — the API
pnpm --filter @devflow/api dev

# terminal 2b — the worker (processes artifacts; needs the App credentials in .env)
pnpm --filter @devflow/worker dev

# terminal 3 — the tunnel
pnpm dlx smee-client --url https://smee.io/<channel> --target http://127.0.0.1:3001/webhooks/github
```

## 6. Verify end to end

Trigger a workflow in the installed repo (push, or re-run an old workflow). Then:

```sh
docker exec devflow-postgres psql -U devflow -d devflow \
  -c "SELECT delivery_id, event_type, action, received_at FROM webhook_events ORDER BY id DESC LIMIT 5;"
```

Expected: one row per delivery; the API log shows `webhook delivery persisted` with the delivery GUID. Redeliver the same delivery from the App's **Advanced → Recent Deliveries** UI and watch it absorbed (`duplicate webhook delivery absorbed`, still one row for that GUID).

With the worker running and a workflow that uploads a JUnit XML artifact, the pipeline continues automatically — check the results:

```sh
docker exec devflow-postgres psql -U devflow -d devflow \
  -c "SELECT w.github_run_id, w.processing_status,
             (SELECT count(*) FROM test_results t WHERE t.workflow_run_id = w.id) AS results
      FROM workflow_runs w ORDER BY w.id DESC LIMIT 5;"
```

`processing_status` meanings: `succeeded` (results parsed), `no_artifacts` (run uploaded nothing), `failed` (permanent error — see `run_artifacts.skipped_reason` and worker logs, correlated by delivery GUID).

## Troubleshooting

- **401 in the API log** — webhook secret mismatch between the App form and `.env`. Fix `.env`, restart the API, redeliver from the Recent Deliveries UI.
- **Nothing arrives** — smee client not running, or the App's webhook URL points to a different/stale channel.
- **Delivery marked failed on GitHub** — the API was down or Postgres unreachable (the endpoint answers 500 by design then). Bring the stack up and use Redeliver; nothing is lost.
