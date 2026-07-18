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
| Permissions → Repository → **Metadata** | Read-only (mandatory anyway)                                                 |
| Subscribe to events                     | **Workflow run**                                                             |
| Where can this app be installed?        | Only on this account                                                         |

Everything else stays off. Least privilege is deliberate: M1 only receives webhooks. Checks: write arrives in M3 (PR annotation), and installers will be asked to re-approve then — that friction is the honest cost of not asking for permissions before needing them. `installation` / `installation_repositories` lifecycle events are delivered to apps automatically, no subscription needed.

Do **not** generate or download a private key yet. M1 never calls the GitHub API, so the key would be an unused credential lying around; M2 (installation-token client) is the milestone that needs it.

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

## Troubleshooting

- **401 in the API log** — webhook secret mismatch between the App form and `.env`. Fix `.env`, restart the API, redeliver from the Recent Deliveries UI.
- **Nothing arrives** — smee client not running, or the App's webhook URL points to a different/stale channel.
- **Delivery marked failed on GitHub** — the API was down or Postgres unreachable (the endpoint answers 500 by design then). Bring the stack up and use Redeliver; nothing is lost.
