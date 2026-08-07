# Stage 1 validation report

> Part of the [Stage 1 plan](stage1-plan.md). The closeout synthesis, written at T8. Every statement cites an [observation-log](observation-log.md) entry (by date and title) or a repository artifact.

**Status: complete — 2026-08-07.** Every exit criterion holds; no open clauses. The last to close was the live-feed observation under real traffic (§3, exit criterion 3), on 2026-08-07 — after a hunt through four false negatives whose root cause (the claim-flow Save had silently removed the demo repo from the installation) is itself one of the stage's more valuable findings.

## 1. Verdict per hypothesis

Final dispositions in [predictions.md](predictions.md); the entries behind them:

| H                                         | Disposition                    | Evidence (log entries)                                                                                                  |
| ----------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| H1–H5 (token dance, artifact pipeline)    | confirmed                      | 2026-08-01 "T5: first real api.github.com pass"                                                                         |
| H6 (real payload normalization)           | confirmed                      | 2026-08-01 "H6 confirmed"; exotic conclusion values remain unobserved by design — soak item                             |
| H7 (Checks API create/PATCH/on-the-PR)    | confirmed                      | 2026-08-01 create path; 2026-08-01 controlled-eviction PATCH; 2026-08-06 "T6 closed" (DB ID = check-URL ID 92586551161) |
| H8 (permission-lag 403 handling)          | **not-observable**             | 2026-08-06 "H8 dispositioned" — the lag never occurred; stub coverage only; soak watches                                |
| H9 (Auth.js login on the App's own OAuth) | confirmed                      | 2026-08-06 "real OAuth login" — plus two environment findings (webview CSRF; `127.0.0.1` host anchoring)                |
| H10 (signed-state Setup-URL claim)        | confirmed                      | 2026-08-06 "claim rides the saved update"                                                                               |
| H11 (installation lifecycle sync)         | confirmed                      | 2026-07-31 "T4" first leg; 2026-08-06 live leg during the claim Save                                                    |
| H12 (clock drift vs 60 s JWT backdate)    | confirmed (stage-long passive) | 2026-08-06 "H12 closed" — zero 401s; 17/17 runs `succeeded`                                                             |
| H13 (redelivery absorbed as duplicate)    | confirmed                      | 2026-07-31 "H13 confirmed"                                                                                              |

## 2. Gate rows

Both founder gates are ✅ in the [release checklist](../session-notes/v0.1.0-release-checklist.md):

- **Live PR annotation** — neutral check on the real PR Checks tab; `flake_check_run_id` equals the check-URL ID; no duplicate check (2026-08-06 "T6 closed").
- **Real-UI quarantine click-through** — `quarantine_records` row 1, `active`, written by the real session user at 2026-08-06 14:15Z from a dashboard click (2026-08-06 "T7 closed").

## 3. The MVP loop, walked against reality

| Clause                           | Real-GitHub evidence                                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install                          | App installed + claimed to the founder workspace (2026-07-30/31 walk; 2026-08-06 claim)                                                                                                 |
| Push → run ingested              | Real `workflow_run` deliveries persisted and processed (T4–T6 entries; 18/18 runs `succeeded` by closeout, incl. the 2026-08-07 live-feed run)                                          |
| JUnit parsed                     | Real artifact zip listed, downloaded via 302, parsed, persisted (2026-08-01 T5)                                                                                                         |
| Flake detected and scored        | Same-commit divergence scored 0.333 `suspected` live (2026-08-01 T6); decay observed to 0.28 (2026-08-06)                                                                               |
| PR check annotates               | Gate row 1 above                                                                                                                                                                        |
| Quarantine approved in dashboard | Gate row 2 above                                                                                                                                                                        |
| Live feed shows activity         | Observed live 2026-08-07: run row 31 delivered → processed → `run.ingested`/`run.processed`/`scores.updated` published → Runs page updated unrefreshed (log, "Exit criterion 3 closed") |

## 4. Fixes made

Every change of the stage traces to a log entry (dates given); Stage 1 closeout changes land in the T8 commit:

- **Guide fixes (T3, committed on the stage branch)** — §3 private-key frictions, UI divergences (OAuth-during-install vs Setup URL mutual exclusivity, absent settings, event checkboxes): entries of 2026-07-30.
- **Guide §3b additions (T8)** — real-browser + `127.0.0.1`-not-`localhost` rules; claim-requires-saved-update; `?connected=1` landing note: entries of 2026-08-06 (H9, H10).
- **Demo README (T8)** — decay timing (story seeds at ~0.53, just above the 0.5 threshold; converged re-runs do not refresh timestamps); oldest-workspace attach caveat: entry of 2026-08-06 (mis-attachment).
- **`scripts/demo/seed.mjs` (T8, code)** — the attach check now asserts the UPDATE's row count (was unconditionally true); first-workspace heuristic documented in place: entry of 2026-08-06 (mis-attachment).
- **`stage1-plan.md` §T2 (T8)** — stale pre-rewrite hash `aff6abf` → `729333c`: entry of 2026-08-06 (hash mapping).
- **Guide §3b claim caution (T8)** — toggled repository selections must be re-checked before the update-Save; a removal silently severs all deliveries for the repo: entries of 2026-08-07.

## 5. Deviations and residual risk

- **H8 not-observable** — permission-lag 403 handling has never run against real GitHub; unit/e2e stub coverage only.
- **Exotic run conclusions** (`cancelled`, `skipped`, `startup_failure`) never arrived on real deliveries (2026-08-01 H6 scope note).
- **The plan's original PATCH probe rested on a misreading of the queue contract** (completed jobs don't re-enqueue inside the last-1000 window); the validated trigger is reprocess-shaped (2026-08-01 entries). Plan text left as-is; the log records the correction.
- **Demo decay window** — the quarantine proposal erodes below threshold days after seeding; documented, not changed.
- **Environment** — smee tunnel gaps (auto-reconnect observed once; Redeliver is the recovery); embedded webviews break login; host consistency (`127.0.0.1`) is load-bearing; WSL2 localhost forwarding can go stale after host sleep (`wsl --shutdown` recovers); an installation's repository selection can be silently narrowed by the claim's own update-Save (2026-08-07 entries) — when deliveries stop, check repository access before anything downstream.
- **Soak watch list (Stage 2):** first real permission-lag 403; exotic conclusion values; tunnel-gap deliveries; token 401s after host sleep; decay behavior over weeks on live repos.

## 6. Stage 2 scope (proposed for founder ratification)

Dogfood soak on the live installation over a multi-week window: no new features; the watch list above as standing observations; any durable surprise becomes a new prediction row + minimal fix per the Stage 1 process. Alongside (post-Release, per checklist step 6): the Dependabot majors queue (D-M6-6). Release + demo video precede the soak's start per the CV-ready ruling.
