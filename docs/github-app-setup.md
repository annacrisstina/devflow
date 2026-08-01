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

**Private key (needed from M2 on):** on the App's settings page, generate a private key — GitHub downloads a PKCS#1 PEM file to wherever your browser saves downloads (under WSL2 that is the Windows Downloads folder, e.g. `/mnt/c/Users/<you>/Downloads`, not `~/Downloads`). It is the system's highest-value secret: never enters the repo, lives only in `.env`, base64-encoded. `.env` is not shell-evaluated — the `$(…)` below is command substitution, so run the lines through your shell rather than pasting them into the file:

```sh
echo "DEVFLOW_GITHUB_APP_ID=<App ID, shown at the top of the App settings page>" >> .env
echo "DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64=$(base64 -w0 <downloads-dir>/devflow-dev-*.private-key.pem)" >> .env
```

Verify the round-trip, then delete the downloaded `.pem` — the key lives only in `.env`:

```sh
awk -F= '/PRIVATE_KEY_BASE64/{print $2}' .env | base64 -d | head -1   # → -----BEGIN RSA PRIVATE KEY-----
```

Display only that header line — never `cat` the PEM or the decoded value. If the full key ever appears on screen, in a log, or in a shared screenshot, treat it as exposed: generate a new key on the App page, replace the `.env` value, revoke the old one.

(M1 deliberately skipped this — no key existed while nothing called the GitHub API.)

## 3b. M4 additions — user login and workspace claiming

M4's dashboard needs three more things on the same App settings page (**if your App predates M4**, add them now; no new repository permissions are involved):

1. **User OAuth (login):** under _Identifying and authorizing users_ set **Callback URL** to `http://127.0.0.1:3001/api/auth/callback/github` (or `<DEVFLOW_APP_URL>/api/auth/callback/github` for a deployment). Leave **Request user authorization (OAuth) during installation** unchecked — GitHub makes it mutually exclusive with the Setup URL ("Unavailable when requesting OAuth during installation"), and the claiming flow needs the Setup URL; the designed order is login first, then install (ADR-0012 binds the signed `state` to the live session). Then generate a **client secret** under _Client secrets_. The App's own OAuth credentials serve user login (ADR-0013) — there is no separate OAuth App.
2. **Setup URL (workspace claiming, ADR-0012):** under _Post installation_ set **Setup URL** to `http://127.0.0.1:3001/api/github/setup` and tick **Redirect on update**. The dashboard's "Connect GitHub" button carries a signed `state` through this redirect; without the Setup URL, installations complete on GitHub but are never claimed by a workspace.
3. **Subscribe to events → Installation** (alongside Workflow run): keeps `installations` rows in sync (account name, uninstalls). Deliveries for it appear like any other webhook.

```sh
# .env additions (see .env.example)
DEVFLOW_AUTH_SECRET=$(openssl rand -hex 32)
DEVFLOW_GITHUB_CLIENT_ID=<Client ID from the App settings page>
DEVFLOW_GITHUB_CLIENT_SECRET=<generated client secret>
DEVFLOW_GITHUB_APP_SLUG=<the app's URL slug, e.g. devflow-dev-username>
```

Note for dev: the OAuth callback and Setup URL point at the **API port directly** (not the smee tunnel — those are browser redirects, not webhooks; they happen on your machine and need no tunnel).

## 4. Install the app

App page → **Install App** → your account → select the repository (or a scratch repo with a workflow, for testing). GitHub immediately sends `installation` events — first proof the pipe works. (A `ping` delivery from webhook creation may already sit in Recent Deliveries. Green checkmarks here only mean the tunnel accepted the POST — smee answers 200 even with no client connected — so deliveries sent before §5's stack is up are lost locally; recover them with **Redeliver** in §6.)

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

- **`docker compose up` fails with "container name … already in use"** — a different checkout's stopped containers (e.g. a fresh-clone audit run) hold the pinned `devflow-postgres`/`devflow-redis` names; only one checkout can own the stack at a time. `docker rm` the stale containers (their data stays in that project's volumes) and re-run.
- **401 in the API log** — webhook secret mismatch between the App form and `.env`; either side can be the stale one. Re-paste the value into whichever is wrong (restart the API only if `.env` changed), then redeliver from the Recent Deliveries UI.
- **Nothing arrives** — smee client not running, or the App's webhook URL points to a different/stale channel.
- **Delivery marked failed on GitHub** — the API was down or Postgres unreachable (the endpoint answers 500 by design then). Bring the stack up and use Redeliver; nothing is lost.
