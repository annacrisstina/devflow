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
- **Observed:** with the toggle on, the Setup URL field is disabled with the message "Unavailable when requesting OAuth during installation." Code inspection shows the toggle was never load-bearing: `/api/github/setup` (`apps/api/src/routes/v1/installations.ts:45`) requires a live session and verifies the signed state against that session's user (ADR-0012) — the designed flow is login first, then install; nothing in the codebase consumes an install-time OAuth redirect. The Setup URL _is_ load-bearing: without it, installations complete on GitHub but are never claimed (the guide's own words).
- **Disposition:** `doc-fix` — founder ruling (2026-07-30): follow the implementation; the toggle stays off, Setup URL + Redirect on update configured. §3b item 1 rewritten; lands in the same commit as this entry. H9 and H10 are unaffected and stay `pending`.

## 2026-07-30 — "Expire user authorization tokens" absent from the current App settings UI (unregistered)

- **Task:** T3 — §3b: checked _Identifying and authorizing users_ for the token-expiry setting, as H9 background.
- **Expected:** a visible **Expire user authorization tokens** option (historical UI), whose default state could be recorded.
- **Observed:** no such setting anywhere on the current settings page. Whatever GitHub's current default token-lifetime behavior is, it is not configurable here; the real behavior will surface at first login.
- **Disposition:** `open` — resolves at T7 when the Auth.js shim meets real token semantics (H9).

## 2026-07-30 — No separate "Installation repositories" event checkbox in the current UI (unregistered)

- **Task:** T3 — §3b item 3: subscribed to **Installation** in _Subscribe to events_; looked for a separate **Installation repositories** checkbox.
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

## 2026-08-01 — T5: first real api.github.com pass — token dance and artifact pipeline end to end (H1–H5)

- **Task:** T5 — founder re-ran the latest `main` CI run from the Actions UI (run 30439149461, producing `run_attempt` 2); worker processed the resulting `workflow_run.completed` delivery (`2b68cc00-8d7e-11f1-8ea3-9044a1ba7c59`).
- **Expected:** H1 (App JWT accepted, exchange 201 first attempt), H2 (`{token, expires_at}` shape, `token` scheme accepted), H3 (listing finds `test-results`, one page), H4 (302 zip download works, auth header dropped cross-origin), H5 (v7 nested zip layout found and parsed).
- **Observed:** the worker completed the job in one pass with no retries: token exchange succeeded (a 401 would have failed the job — H12 note: no 401s observed), artifact listed and downloaded, zip scanned. `run_artifacts`: `test-results`, github_artifact_id 8815539220, 10 249 bytes, **5 XML files found**, no skip reason. `workflow_runs`: `(30439149461, 2)`, `head_branch` main, conclusion `success`, `processing_status = 'succeeded'`, **203 test results** — exactly the M6 pre-tag suite count. Detection ran post-persist and correctly no-opped (`no identities to assess` — an all-green run gives ADR-0010 nothing to score). Run URL: `https://github.com/annacrisstina/devflow/actions/runs/30439149461`.
- **Disposition:** `confirmed` × 5 — H1–H5 flipped in [predictions.md](predictions.md).

## 2026-08-01 — H6 confirmed: real `workflow_run` payloads normalize cleanly; `in_progress` persisted, not enqueued

- **Task:** T5 — inspected both real `workflow_run` deliveries (`f2fd9710-…` `in_progress`, `2b68cc00-…` `completed`) against the normalization path.
- **Expected:** H6: real deliveries normalize without permanent failures; numeric IDs at real magnitudes.
- **Observed:** both persisted raw; only `completed` enqueued processing (by design). Normalized fields match the GitHub UI: run ID 30439149461 and artifact ID 8815539220 sit comfortably in `bigint`; `head_branch` non-null here; conclusion `success`. Scope note: the exotic conclusion values the stub never sent (`cancelled`, `skipped`, `startup_failure`) remain unobserved — the prediction as registered ("no permanent failures on real deliveries") is met; any later normalization failure during T6/soak becomes a new entry and, if durable, a new prediction row.
- **Disposition:** `confirmed` — H6 flipped in [predictions.md](predictions.md).

## 2026-08-01 — smee tunnel dropped and auto-reconnected mid-session (unregistered, environment)

- **Task:** T5 — tunnel observation during the run.
- **Expected:** guide §2/§5 treat the smee client as fire-and-forget.
- **Observed:** the client logged `ECONNRESET`, reconnected on its own, and kept forwarding; both deliveries of the session persisted — nothing observed lost. If a delivery ever lands in the reconnect gap, Recent Deliveries + Redeliver is the recovery path (T4-validated).
- **Disposition:** `confirms` — no fix; noted for the soak, where tunnel gaps become likelier.

## 2026-08-01 — T6: live detection and first real check run (H7, create path)

- **Task:** T6 — seeded `devflow-demo-flaky` from the template; first CI run failed; founder re-ran all jobs on the same commit (`31699e59`, run 30691675671, attempts 1→2).
- **Expected:** ADR-0010's strongest signal — same-commit divergence, weight 1.0 — promotes `retries the payment gateway on timeout` to `suspected`; annotation posts a neutral check.
- **Observed:** per-test divergence across attempts (both runs concluded `failure`, but the flaky test's outcome flipped) scored 0.333/`suspected`, `divergence_evidence` 1 — the e2e's pinned arithmetic, live. Worker: `suspected: 1 … flagged: 1, checkRunId: 91347631009, flake check created`; ID round-tripped into `workflow_runs.flake_check_run_id` (attempt-2 row). Founder verified the real Checks tab: check is neutral, evidence table renders, title "1 suspected-flaky among 2 failing tests" (screenshot). The healthy-verdict failing test was correctly not flagged.
- **Disposition:** `confirms` — H7's create path (body accepted, ID round-trip, rendering); H7 stays `pending` on its PATCH and on-the-PR clauses.

## 2026-08-01 — Each run attempt creates its own check object; GitHub displays latest-per-name (unregistered)

- **Task:** T6 — founder re-ran the same commit again (attempt 3) as a PATCH probe (a misdirected one — see next entry).
- **Expected:** plan wording: "PATCH idempotency on a further delivery (still exactly one check)".
- **Observed:** attempt 3 is a new `(github_run_id, run_attempt)` row with no stored check ID, so the annotation stage correctly took the create path: second check object `91348288795` on the same SHA. The real Checks UI collapses same-name checks to the latest object — founder verified exactly one visible "DevFlow flake report". So per-attempt creation never visually stacks duplicates; "exactly one check" holds at the UI level by GitHub's own semantics.
- **Disposition:** `confirms` — matches `annotation-stage.ts` as written (PATCH is for reprocessing the _same_ attempt); no fix. Display semantics recorded for H7's final PR clause.

## 2026-08-01 — Redelivery of a successfully completed event is a queue-layer no-op; the plan's PATCH probe cannot fire (unregistered)

- **Task:** T6 — founder redelivered attempt 3's `workflow_run.completed` (`c055b2b0-8d83-11f1-8aef-9e943b31ab5e`) to trigger the PATCH path.
- **Expected:** duplicate absorbed at the DB, job re-enqueued (webhooks.ts enqueues on the duplicate path), reprocess finds `flake_check_run_id` → `flake check updated`.
- **Observed:** no PATCH: `devflow_check_runs_written_total` shows `created` 2 and no `updated` counter. Cause: the re-add uses `jobId: evt-16`, which still sits in BullMQ's completed set (`removeOnComplete: {count: 1000}`), so BullMQ silently dropped it. This is the queue contract behaving exactly as its own comment documents ("best-effort only … completed jobs are eventually removed and a later redelivery would re-enqueue") — redelivery-as-repair works for _lost_ jobs (not in the completed set), not for _successfully completed_ ones until they age out of the last-1000 window. The plan's "further delivery → PATCH" procedure rests on a misreading of that contract; the system is correct per design, the test procedure was not.
- **Disposition:** `confirms` the queue contract; the PATCH clause of H7 needs a reprocess-shaped trigger instead — next entry records the chosen route.

## 2026-08-01 — Controlled eviction, then redelivery: real Checks API PATCH confirmed (H7, PATCH clause)

- **Task:** T6 — founder-approved simulation of the documented completed-job age-out: `zrem bull:ingest:completed evt-16` + `del bull:ingest:evt-16` (ephemeral Redis queue state only; Postgres and code untouched), then founder redelivered `c055b2b0-…` once more.
- **Expected:** re-add succeeds; full reprocess of run row 4; annotation stage finds `flake_check_run_id` 91348288795 and PATCHes it; no third check object.
- **Observed:** all three: `devflow_check_runs_written_total{action="updated"} 1` (previously absent), worker `flake check updated`, DB `flake_check_run_id` unchanged with no new check ID; `webhook_events` still one row per GUID; replace-per-run held through the reprocess (identical divergence evidence, score re-decayed 0.3333 → 0.3329); `evt-16` re-entered the completed set on success. The PATCH body is accepted by the real Checks API.
- **Disposition:** `confirms` — H7's PATCH clause; H7 stays `pending` only on its on-the-PR clause.

## 2026-08-06 — T6 closed: neutral check visible on the real PR, DB ID matches the check URL (H7, on-the-PR clause)

- **Task:** T6 — new session; full stack restarted (Docker compose, API, worker, smee client — the smee client was initially forgotten, leaving re-run deliveries lost at the tunnel; recovered by re-running after starting it). Founder re-ran the failing workflow on `devflow-demo-flaky` and verified the PR's Checks tab. PR: <https://github.com/annacrisstina/devflow-demo-flaky/pull/1>; check: <https://github.com/annacrisstina/devflow-demo-flaky/runs/92586551161>; screenshot: founder-captured, 2026-08-06 (PR Checks tab, single neutral DevFlow flake report).
- **Expected:** H7's remaining clause: exactly one visible neutral "DevFlow flake report" on the PR, with the DB-stored check ID equal to the ID in the real check's URL.
- **Observed:** all held. The PR shows a single neutral DevFlow flake report — "1 suspected-flaky among 1 failing test", verdict `suspected`, score 0.28, evidence: 1 same-commit pass/fail divergence. DB: `workflow_runs` row 6 carries `flake_check_run_id = 92586551161`, `processing_status = 'succeeded'` — equal to the check URL's ID, founder-verified. Earlier check objects (91347631009, 91348288795) remain collapsed behind GitHub's latest-per-name display semantics (2026-08-01 entry): exactly one visible check. Score 0.28 vs 0.3333 at first detection reads as the scorer's time decay over the intervening days (interpretation; not separately verified).
- **Disposition:** `confirms` — H7's on-the-PR clause; with the create path and PATCH clause (2026-08-01 entries), H7 is fully `confirmed`. T6 complete per plan: DB ID = check-URL ID, no duplicate check; evidence = PR/check URLs, screenshot, DB row. Release-checklist gate row 1 flips at T8 with this entry as its evidence link.

## 2026-08-06 — T7: real OAuth login through the Auth.js shim (H9); two environment frictions

- **Task:** T7 — first real login attempt from VS Code's Simple Browser failed `MissingCSRF`; a later Chrome attempt hit `ERR_CONNECTION_REFUSED` (Vite had been stopped). Server-side flow was then verified independently: simulated CSRF-cookie sign-in POSTs (direct to :3001 and through the Vite proxy) both returned 302 to `github.com/login/oauth/authorize` with client ID and the correct `redirect_uri` — the shim, env vars, and CSRF double-submit are all sound.
- **Expected:** H9 — login round-trip yields a session row; registered failure modes were callback mismatch / login loop / no session.
- **Observed:** neither registered failure mode; both blocks were environmental. (1) Embedded-webview browsers (VS Code Simple Browser) do not return the CSRF cookie → `MissingCSRF`; a real browser is required. (2) Cookies are host-scoped and the flow is anchored on `127.0.0.1` (`DEVFLOW_APP_URL` default) — the dashboard must be browsed at `http://127.0.0.1:5173`, not `localhost:5173`, or the session cookie set by the callback never reaches the SPA's proxied requests. From Windows Chrome at `127.0.0.1:5173` the full round-trip succeeded: `users` 1 row, `sessions` 1 row, dashboard authenticated.
- **Disposition:** `confirms` — H9. Doc-fix candidate for T8: guide §3b note — use a real browser and browse the dashboard on `127.0.0.1`, never `localhost` or an embedded webview.

## 2026-08-06 — T7: claim rides the _saved update_, not the settings-page visit (H10; H11 live leg)

- **Task:** T7 — first Connect GitHub click landed on the existing installation's settings page and no claim fired (`workspace_id` stayed NULL); founder retried per the corrected procedure: fresh Connect click (fresh 15-min state), then **Save under Repository access** on GitHub's page.
- **Expected:** ADR-0012 flow — GitHub carries the signed `state` to the Setup URL; for an already-installed App the redirect only fires on a completed _update_ ("Redirect on update" ticked).
- **Observed:** merely viewing the settings page fires nothing — GitHub redirects to the Setup URL only when an action completes. On Save: browser → `/api/github/setup` → `?connected=1` (the landing page is on :3001, which does not serve the SPA in dev — the URL, not the page, signals success). DB: installation 150087152 bound to workspace 2. The Save also emitted a real `installation_repositories` (`removed`) delivery at 14:00:55Z, processed and synced — H11's live leg on top of T4's first leg.
- **Disposition:** `confirms` — H10 and H11. Doc-fix candidate for T8: guide §3b — state explicitly that for an existing installation the claim requires saving an update, and that the post-claim landing page in dev is the API port (check the URL for `connected=1`).

## 2026-08-06 — T7: demo seed attached to the wrong workspace — first-created heuristic + a check that cannot fail (unregistered)

- **Task:** T7 — Quarantine page showed "Nothing to propose" and `quarantine_records` was empty despite the seeded story; investigated before assuming score decay.
- **Expected:** seed attaches demo installation 770001 to the founder's workspace; `Checkout.retries_on_timeout` proposes at ~0.53.
- **Observed:** the flaky verdict existed all along (0.529, 3 divergences, computed same day) but in the wrong tenant: an accidental junk workspace (named from checkpoint SQL pasted into the create-workspace field, `created_at` 13:27) predated the real one (13:43), and `seed.mjs` attaches to the **first workspace by `created_at`**. Masking it: the seeder's "demo installation attached to workspace" check passes `true` unconditionally (`seed.mjs:307`) — it cannot fail, so mis-attachment reported as success. The "0.28 suspected" initially blamed was the real repo's test, correct at 0.28. Remedy: FK-ordered removal of the junk workspace (detach 770001 → delete members → delete workspace), re-ran `pnpm demo:seed` — deliveries converged as duplicates, attach bound 770001 to the real workspace, proposal appeared.
- **Disposition:** `code-fix` candidate for T8 reconciliation: assert the attach UPDATE's row count in the seeder check; reconsider the first-workspace heuristic (or document it). Doc note for `scripts/demo/README.md`: the story seeds at 0.529 — deliberately just above the 0.5 flaky threshold — so the quarantine click-through must happen within days of seeding, before read-time decay pulls it under.

## 2026-08-06 — T7 closed: quarantine approved in the real UI (gate row 2 evidence)

- **Task:** T7 — with the demo data attached to the real workspace, founder opened the Quarantine page, saw the proposal, and approved it.
- **Expected:** plan completion criteria — session and claim rows exist; dashboard shows real repos; a quarantine decision row exists from a real UI click.
- **Observed:** all three. Proposal for `checkout-service · checkout-suite/Checkout.retries_on_timeout` (effective ~0.53) rendered; approval wrote `quarantine_records` row 1: `status = 'active'`, `created_by` = the real session user, `created_at` 2026-08-06 14:15:39Z, no reason text. Dashboard shows the real and demo repositories side by side. Screenshots: founder-captured, 2026-08-06 (dashboard with real + demo repositories; quarantine approval).
- **Disposition:** `confirms` — T7 complete per its stated criteria. This entry is release-checklist gate row 2's evidence link (flips at T8). Outstanding for exit criterion 3 (MVP loop, "live feed shows activity"): a live-feed observation during real traffic — closed 2026-08-07; see that day's entries (tunnel-down false negatives → repo-removal root cause → live observation).

## 2026-08-06 — T8: H8 dispositioned `not-observable` — the Checks-permission lag never occurred

- **Task:** T8 reconciliation. H8 predicted transient-403 handling (retries into DLQ, ingestion unblocked) **if** Checks-permission approval lagged installation — registered as observable only under that lag.
- **Expected:** per the prediction's own criteria column, only observable if the lag happens.
- **Observed:** it never did. The App was created at T3 with its permissions before any installation; every check write across T6–T7 succeeded on first attempt (`created` ×3, `updated` ×1; no DLQ entries). The retry classification remains covered by unit/e2e against the stub only.
- **Disposition:** `not-observable` — with rationale recorded per the plan. Stage 2 soak should watch for the first real permission-lag occurrence (new installs on other accounts are the likely trigger).

## 2026-08-06 — T8: H12 closed — no token-exchange 401s across the stage (passive watch, confirmed)

- **Task:** T8 reconciliation. H12 (environment, passive, all-stage): WSL2 clock drift after host sleep does not invalidate freshly minted App JWTs; the 60 s backdate absorbs it.
- **Expected:** no 401 bursts across the stage's sessions; failure signature was intermittent token-exchange 401s correlating with host sleep.
- **Observed:** none, anywhere in the stage's record. Every real-API interaction succeeded — T5 token dance, T6 check create/PATCH, T7 traffic; all 17 `workflow_runs` rows end `processing_status = 'succeeded'` (a token failure would have surfaced as failed processing or DLQ entries; there are none). The stage spanned multiple environment restarts and host sleeps (2026-08-01 tunnel drop; 2026-08-06 full-stack restart) without a single 401 logged.
- **Disposition:** `confirms` — within the scope observed across the stage; the soak extends the watch window.

## 2026-08-06 — T8: authorship rewrite of 2026-08-01 — old→new commit-hash mapping (repository record)

- **Task:** T8 — founder-approved deferred cleanup from 2026-08-01, when `docs/v01x-stage1-validation` was rewritten to strip Co-Authored-By trailers. Earlier log entries and commit messages citing pre-rewrite hashes stay byte-identical (this log is append-only); this entry is the durable mapping.
- **Mapping (old → new):** T1 plan-of-record `aff6abf` → `729333c`; T2 absorption ruling `58bc76f` → `4a94b82`; T3 real-App walk `1445fad` → `290b745`; T4 inbound validation `be1ede4` → `387d3dd`; T5 outbound validation `cd61f7a` → `6b1e4aa`.
- **Repairs:** the one live stale reference — the `aff6abf` parenthetical in `stage1-plan.md` §T2 — updated to `729333c` in this change. The stale hash inside the T2 commit message itself is documented here, not rewritten.
- **Disposition:** repository record; no hypothesis touched.

## 2026-08-07 — Live-feed check: a tunnel-down false negative; the socket path verified end-to-end by authenticated probe (unregistered)

- **Task:** exit criterion 3's last clause — founder re-ran the workflow with the Runs page open to observe the live update; the page did not update without a refresh. Investigated before recording a failure.
- **Expected:** `run.ingested`/`run.processed`/`scores.updated` events reach the browser and the Runs list refetches on its own (ADR-0015).
- **Observed:** the UI was **correctly quiet — no delivery ever arrived**: `webhook_events` has zero rows for 2026-08-07 (`max(received_at)` = 2026-08-06 14:03), no new `workflow_runs` row exists for the re-run, and the worker's `devflow_live_events_published_total` counter is empty since boot. The smee client was not running — the third forgotten-smee incident of the stage (cf. 2026-08-06 T6-closed; §4 note of 2026-07-30). The run the founder saw after refreshing was prior data. Separately, the server chain was verified by synthetic probe: two Socket.IO clients authenticated with the real session cookie — one direct to `:3001`, one through the Vite websocket proxy exactly as the browser connects — both joined room `ws:2` and both received a synthetic `run.ingested` published into `devflow:live-events` (ephemeral Redis pub/sub; no Postgres rows touched). Auth handshake, membership rooms, worker→Redis→API relay wiring, and the dev proxy are all confirmed working; the sole unobserved remainder is the browser refetch during real traffic. Also recorded: a naming gap — nothing in the UI is called "Activity" or "Feed"; the live feed is the Runs page silently refetching (`runs-page.tsx:16`), which the founder reasonably could not find by name.
- **Disposition:** `confirms` the server path (probe); environment note for the tunnel. The exit-criterion clause **stays open** pending one real-traffic observation: smee client up → redeliver today's `workflow_run.completed` (or re-run) → watch the Runs page update unrefreshed; `devflow_live_events_published_total` incrementing is the corroborating counter. Doc-note for Stage 2 consideration: a visible activity indicator (or a "live" badge) would make the feed discoverable; no code change now.

## 2026-08-07 — Live-feed retries explained: the claim's Save had removed `devflow-demo-flaky` from the installation (unregistered)

- **Task:** after a further retry with the smee client running still produced zero deliveries, founder verified the App's Webhook URL character-for-character against the listening channel (identical) and found Recent Deliveries contained **no** `workflow_run` deliveries for the day at all — GitHub was not creating them. Compared the stored `installation_repositories` payloads.
- **Expected:** a completed rerun on a covered repo generates a `workflow_run` delivery.
- **Observed:** the repo was no longer covered. Payloads: 2026-08-06 14:00:55Z `repositories_removed: [devflow-demo-flaky]` with nothing added — the T7 claim-flow Save had toggled the repo **off**, and the re-add half of the toggle never happened (contrast 2026-07-31, where removed 13:46:46 → added 13:46:54 completed the round trip). From that moment GitHub created no deliveries for the repo, dooming every live-feed retry at the source; the claim's own success (`?connected=1`) masked the side effect. The two retries where a "new run" was seen after refreshing are also explained: the DB shows no new rows on those attempts — pre-existing rows were misread as new, which is why this log rules on recorded state, not impressions. Remedy: repo re-added 16:26:53Z (`installation_repositories` `added`, GUID `cc310280-…`) — the pipe's first real delivery since the removal, arriving through the tunnel within seconds of the Save.
- **Disposition:** `doc-fix` — guide §3b gains a caution on the claim's update-Save: if the repository selection is toggled to force the update, re-check the final selection before saving; removing a repo silently stops every delivery for it. Lands in this closeout change.

## 2026-08-07 — Exit criterion 3 closed: live feed observed under real traffic (unregistered)

- **Task:** the clean test, every link now verified beforehand: repo restored to the installation, smee client on the App's exact channel, Runs page loaded once at `127.0.0.1:5173` and untouched thereafter; founder re-ran the workflow.
- **Expected:** the run appears in the Runs list without a refresh (ADR-0015: event → invalidate → REST refetch); the worker's publish counters increment.
- **Observed:** the full chain, correlated: `workflow_run` `in_progress` (GUID `3efad7f0-…`, 16:30:06Z) and `completed` (GUID `483a3ea0-…`, 16:30:21Z) delivered; run row 31 (`github_run_id` 31088393065, attempt 7) processed `succeeded`; `devflow_live_events_published_total` = `run.ingested` 1, `run.processed` 1, `scores.updated` 1 — the first live events ever published by this stack (every earlier real run was processed while the installation was unclaimed, where the publisher is correctly silent). Founder observed the Runs page update on its own, no manual refresh.
- **Disposition:** `confirms` — ADR-0015's chain live end to end: GitHub → tunnel → HMAC → queue → worker → Redis → Socket.IO room → Vite ws proxy → browser refetch. Exit criterion 3's last clause is closed; the MVP loop is fully demonstrated against reality. The naming-gap doc-note (no page called "Feed") stands for Stage 2.
