# v0.1.x observation log

> Part of the [Stage 1 plan](stage1-plan.md). **Append-only** — the [development-log](../development-log.md) discipline applied to validation: entries are never edited or reordered after the fact; corrections are new entries referencing the old. The phase rule this log enforces: **a code change requires an observation-log entry** (roadmap, v0.1.x). Doc fixes are logged too — the guide is itself under test.
>
> One entry per observation, expected or not. "It worked as predicted" is an observation; silence is not evidence (NEVER-8).

## Entry format

```markdown
## YYYY-MM-DD — <short title> (<H-id from predictions.md, or "unregistered">)

- **Task:** T<n> — what was executed, exactly (command, click path, delivery GUID).
- **Expected:** the pre-registered prediction, or the guide/ADR claim being exercised.
- **Observed:** what actually happened, with raw evidence inline or referenced —
  query output, log excerpt, URL, screenshot filename. Delivery GUIDs and
  run IDs included wherever they exist, for correlation.
- **Disposition:** `confirms` | `doc-fix` | `code-fix` | `open` — for fixes,
  the commit hash once it exists (a later entry may supply it).
```

Rules:

- An unpredicted observation is registered here first as `unregistered`, then (if it names a durable assumption) appended to [predictions.md](predictions.md) as a new row before any fix lands.
- A `code-fix` entry precedes its commit; the commit message references nothing, the log carries the trace.
- Secrets, tokens and private-key material never appear in evidence — GUIDs, IDs and status codes are enough.

---

## 2026-07-29 — T2 scaffolds absorbed into T1; T2 ruled complete without its own commit (unregistered)

- **Task:** T2 — reviewed repository state after the T1 commit `aff6abf` to determine remaining T2 scope.
- **Expected:** T2 lands `observation-log.md` and `validation-report.md` in its own commit, keeping the task boundary visible in history.
- **Observed:** both scaffolds were already committed in `aff6abf`, because the plan, the prediction register and the README index referenced them and T1's tree had to stay link-coherent. No committable T2 scope remained.
- **Disposition:** `doc-fix` — founder ruling (2026-07-29): T2 is complete on the T1 evidence; no artificial marker commit. The T2 section of [stage1-plan.md](stage1-plan.md) records the ruling; that fix lands in the same commit as this entry.

## 2026-07-30 — Fresh App ruled for T3; §1–§3 form walk matched the guide (unregistered)

- **Task:** T3 — founder ruling: create a fresh GitHub App (the §3 primary path) rather than upgrading the M1-era App, minimizing inherited state; the old App is kept for historical reference until the new one validates. Walked §1 (webhook secret rotated into `.env`), §2 (fresh smee channel, no account needed, immediate redirect — as described), §3 (form filled exactly per the table; App ID 4435182).
- **Expected:** form fields as the §3 table names them; nothing beyond the table needed at creation.
- **Observed:** all table fields present and accepted as written. Two UI details the guide does not mention, neither blocking: the settings page shows the Client ID immediately at creation (§3b implies it appears later), and GitHub banners a prompt to generate a private key before installation.
- **Disposition:** `confirms` — no fix needed; details recorded for completeness.

## 2026-07-30 — Private key is PKCS#1 as assumed; `.env` round-trip verified (H1, premise only)

- **Task:** T3 — generated the App private key; verified the PEM header before encoding (`head -1` on the download) and after (`awk -F= '/PRIVATE_KEY_BASE64/{print $2}' .env | base64 -d | head -1`).
- **Expected:** H1's premise: GitHub delivers a PKCS#1 PEM (`-----BEGIN RSA PRIVATE KEY-----`), which `createPrivateKey` is fed directly.
- **Observed:** `-----BEGIN RSA PRIVATE KEY-----` at both checkpoints. No key material beyond the header line was displayed or recorded.
- **Disposition:** `confirms` the premise; H1 stays `pending` until the real token exchange (T5).

## 2026-07-30 — First private key exposed during verification; rotated and revoked in-session (unregistered)

- **Task:** T3 — §3 private-key verification on the founder's machine.
- **Expected:** verification displays only the PEM header line; key material never appears anywhere but `.env` (NEVER-5).
- **Observed:** the full key was printed to the terminal during verification and appeared in screenshots shared during the walkthrough — an exposure. Handling, same session: a new private key generated on the App settings page, the `.env` Base64 value replaced, the original key revoked, the round-trip check re-run against the new key (header line only). App ID unchanged (4435182). No key material appears in this log or survives the rotation.
- **Disposition:** `doc-fix` — the §3 verify step gains an explicit caution to display only the header line and to rotate-and-revoke on any exposure; lands in the same commit as this entry. The incident is also evidence the NEVER-5 discipline works: exposure → detection → rotation inside one session.

## 2026-07-30 — §3 private-key block: three guide frictions (unregistered)

- **Task:** T3 — executed the §3 "Private key" block on WSL2.
- **Expected:** the block as written: PEM lands at `~/Downloads`; the `DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64=$(base64 …)` line goes into `.env`.
- **Observed:** (1) under WSL2 the browser is Windows-side, so the PEM lands in the Windows Downloads folder (here `/mnt/d/Downloads`), not `~/Downloads`; (2) the snippet's `$(…)` is command substitution — pasted literally it stays a literal string, because `.env` is not shell-evaluated, and the worker would base64-decode garbage; the line must be produced through a shell (`echo "…" >> .env`); (3) the guide never says to delete the downloaded PEM, though its own rule is that the key "lives only in `.env`".
- **Disposition:** `doc-fix` — §3 private-key block rewritten (shell-run snippet, download-location note, verify-then-delete step); lands in the same commit as this entry.

## 2026-07-30 — GitHub UI: OAuth-during-installation and Setup URL are mutually exclusive (unregistered)

- **Task:** T3 — §3b: set the Callback URL, enabled **Request user authorization (OAuth) during installation** per the guide, then attempted to set the Setup URL.
- **Expected:** guide §3b: both enabled together — Callback URL + OAuth-during-installation (item 1) and Setup URL + Redirect on update (item 2).
- **Observed:** with the toggle on, the Setup URL field is disabled with the message "Unavailable when requesting OAuth during installation." Code inspection shows the toggle was never load-bearing: `/api/github/setup` (`apps/api/src/routes/v1/installations.ts:45`) requires a live session and verifies the signed state against that session's user (ADR-0012) — the designed flow is login first, then install; nothing in the codebase consumes an install-time OAuth redirect. The Setup URL *is* load-bearing: without it, installations complete on GitHub but are never claimed (the guide's own words).
- **Disposition:** `doc-fix` — founder ruling (2026-07-30): follow the implementation; the toggle stays off, Setup URL + Redirect on update configured. §3b item 1 rewritten; lands in the same commit as this entry. H9 and H10 are unaffected and stay `pending`.

## 2026-07-30 — "Expire user authorization tokens" absent from the current App settings UI (unregistered)

- **Task:** T3 — §3b: checked *Identifying and authorizing users* for the token-expiry setting, as H9 background.
- **Expected:** a visible **Expire user authorization tokens** option (historical UI), whose default state could be recorded.
- **Observed:** no such setting anywhere on the current settings page. Whatever GitHub's current default token-lifetime behavior is, it is not configurable here; the real behavior will surface at first login.
- **Disposition:** `open` — resolves at T7 when the Auth.js shim meets real token semantics (H9).

## 2026-07-30 — No separate "Installation repositories" event checkbox in the current UI (unregistered)

- **Task:** T3 — §3b item 3: subscribed to **Installation** in *Subscribe to events*; looked for a separate **Installation repositories** checkbox.
- **Expected:** unclear from the guide itself, which is in tension: §3 says `installation` / `installation_repositories` lifecycle events are "delivered to apps automatically, no subscription needed," while §3b item 3 says to subscribe to **Installation**. H11 assumes both event types arrive.
- **Observed:** the current UI offers **Installation** (now ticked) and no separate **Installation repositories** checkbox.
- **Disposition:** `open` — whether `installation_repositories` deliveries arrive under this configuration is exactly what H11 observes (T4/T7); the guide's internal tension gets resolved by that evidence, not by guessing now.

## 2026-07-30 — §4 install: one installation covering two repos; `ping` + `installation.created` delivered into an unlistening tunnel (unregistered)

- **Task:** T3 — §4: created the empty public `devflow-demo-flaky`; installed the App on the account with `devflow` and `devflow-demo-flaky` selected; inspected Advanced → Recent Deliveries.
- **Expected:** guide §4: "GitHub immediately sends `installation` events — first proof the pipe works." Plan T3 evidence line: "both installations visible on the App page."
- **Observed:** (1) GitHub's model is one installation per account with repositories selected inside it — the App page shows a single installation listing both repos; the plan's "both installations" only reads literally as "both repositories under the installation." (2) Recent Deliveries: `ping` and `installation.created`, both green — the guide never mentions `ping`. (3) Green here only means smee accepted the POST (it answers 200 with no client connected); no local stack was running, §5 being a later step, so both deliveries were lost locally — recoverable via Redeliver, which is T4's job and feeds H13.
- **Disposition:** `doc-fix` — §4 gains the ping/green-checkmark caveat; lands in the same commit as this entry. The plan's wording imprecision is recorded here rather than edited into the ratified plan; the T3 evidence requirement is met by the single installation listing both repositories.

## 2026-07-31 — §5 blocked by stale containers from a prior fresh-clone audit; clean slate ruled (unregistered)

- **Task:** T3 — §5: `docker compose up -d` failed: `Conflict. The container name "/devflow-postgres" is already in use`. Provenance via `docker inspect` labels: five `Exited (0)` containers from compose project `devflow-audit`, created 2026-07-23 in a since-deleted scratchpad fresh clone (an audit run); the compose file pins `container_name` (deliberately — §6's `docker exec devflow-postgres` depends on it), so any other checkout's containers, even stopped, block this one.
- **Expected:** §5 boots on a machine with no competing stack; the guide's troubleshooting section has no entry for this failure.
- **Observed:** as above. Founder ruling (2026-07-31): remove the five stale containers and all four `devflow*` volumes (orphaned `devflow-audit_*` pair plus the milestone-era `devflow_*` pair) — Stage 1 evidence discipline wants every database row attributable to a real delivery or a deliberate seed, and starting empty re-validates the migration path. No code change: the pinned names are load-bearing.
- **Disposition:** `doc-fix` — troubleshooting bullet added for the name conflict; lands in the same commit as this entry.

## 2026-07-31 — T3 complete: §5 loop up, worker boots on real credentials, zero-row baseline (unregistered)

- **Task:** T3 — §5 walked after cleanup: `docker compose up -d`; migrations; API dev; worker dev; smee client.
- **Expected:** the T3 completion criterion — "the worker boots with real credentials (its config hard-requires App ID + key)".
- **Observed:** containers healthy (project `devflow`); migrations applied to an empty database (volume created 2026-07-31 12:49); API on `127.0.0.1:3001` and worker booted (`ingest worker started`), both `/healthz` → `{"status":"ok"}` (worker on :3002) — the worker's boot-time base64→PEM decode of the real key succeeded; smee client forwarding to `/webhooks/github`. Baseline row counts: `webhook_events` 0, `workflow_runs` 0, `installations` 0, `test_results` 0. Install-side evidence: one installation covering `devflow` + `devflow-demo-flaky` (App ID 4435182). §6's end-to-end verification is deliberately not run here — its subject matter (deliveries, redelivery, artifact pipeline) is T4/T5; the lost `ping`/`installation.created` deliveries await T4's redelivery pass.
- **Disposition:** `confirms` — T3 complete per its plan criterion. Guide §§1–5 walked literally; all divergences dispositioned in the entries above.

## 2026-07-31 — First real redelivery rejected 401: webhook secret mismatch, form side (unregistered)

- **Task:** T4 — redelivered the T3 `ping` through the now-listening tunnel.
- **Expected:** 202, `webhook delivery persisted`.
- **Observed:** smee forwarded correctly; API rejected with 401 `webhook delivery rejected: invalid signature`. Local side verified clean without displaying the value (64 hex chars, no CR/quotes/whitespace; API booted after the last `.env` edit) — isolating the mismatch to the App form, which still held a stale value from the §1 rotation. Re-pasting the `.env` value into the form (via clipboard, never displayed) and redelivering produced 202. The troubleshooting bullet's failure mode is confirmed, but its fix assumes `.env` is the stale side; here it was the form.
- **Disposition:** `doc-fix` — troubleshooting bullet generalized to either side; lands in the same commit as this entry.

## 2026-07-31 — T4: real deliveries persisted; `installations` synced from a real payload (H11, first leg)

- **Task:** T4 — redelivered `ping` and `installation.created`; queried Postgres.
- **Expected:** raw-first persistence (ADR-0005) against real payloads; `installation.created` processed into an `installations` row.
- **Observed:** `ping` persisted (GUID `7d78a3a0-8c0f-11f1-8109-c534a14e2e84`, `action` and `installation_id` NULL — only `workflow_run`/`installation` enqueue processing). `installation.created` (GUID `86536780-8c19-11f1-8e22-e5d017dac832`) → API `installation job enqueued`, worker `installation event applied` → row: `github_installation_id` 150087152, `annacrisstina`/`User`, `uninstalled_at` NULL, `workspace_id` NULL (claiming is exclusively T7's signed redirect — correctly untouched).
- **Disposition:** `confirms` — H11's install leg holds; H11 stays `pending` for its remaining legs (uninstall; T7 claim interplay).

## 2026-07-31 — H13 confirmed: real Redeliver absorbed as a duplicate

- **Task:** T4 — redelivered `installation.created` (`86536780-…`) a second time via the Recent Deliveries UI.
- **Expected:** H13: second delivery logs `duplicate webhook delivery absorbed`; row count unchanged.
- **Observed:** API responded 200 (vs 202 first time) and logged `duplicate webhook delivery absorbed`; post-redeliver query: 4 `webhook_events` rows, 4 distinct GUIDs — exactly one row per GUID; `installations` unchanged (convergent handler). ADR-0005 holds against GitHub's real redelivery mechanism.
- **Disposition:** `confirmed` — H13 flipped in [predictions.md](predictions.md).

## 2026-07-31 — `installation_repositories` events arrive under the Installation subscription; persisted raw, unprocessed by design

- **Task:** T4 — removed and re-added `devflow-demo-flaky` in the installation's repository selection.
- **Expected:** open question from the 2026-07-30 no-separate-checkbox entry: whether `installation_repositories` deliveries arrive at all under the current UI's single **Installation** checkbox.
- **Observed:** both deliveries arrived and persisted (`45230202-…` `removed`, `497706a0-…` `added`, both carrying `installation_id` 150087152); the worker did not process them — correct per the code, which enqueues only `installation` events. Note for H11's final disposition: its wording ("rows appear/update on … repo-selection change") overstates the implementation — `installations` tracks account identity and uninstall state, not repository selection; "in sync" means those fields only. This entry resolves the earlier entry's `open` disposition: subscription behavior observed, no guide change needed.
- **Disposition:** `confirms` — H11 evidence accumulated; row stays `pending` until its remaining legs are seen.
