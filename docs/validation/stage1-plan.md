# v0.1.x Stage 1 — Real GitHub validation: plan of record

> The phase plan the [roadmap](../project-memory/roadmap.md) references for the v0.1.x phase. Produced from repository state, discussed and ratified with the founder on 2026-07-29. Companion artifacts, all in this directory: [predictions.md](predictions.md) (pre-registered hypotheses), [observation-log.md](observation-log.md) (append-only evidence), [validation-report.md](validation-report.md) (final synthesis, written at closeout).

## Objective

Stage 1 validates the existing GitHub integration against the real GitHub API and collects objective evidence. It adds no features. Before this stage, exactly one leg of the integration had ever touched reality: M1's live webhook pass through a smee tunnel. Everything outbound — App JWT, installation-token exchange, artifact listing and download, check-run writes — plus OAuth login, Setup-URL claiming and installation lifecycle events has only ever been exercised against the in-memory stub (`scripts/e2e/harness.mjs`).

Operating rule of the phase (roadmap): **a code change requires an observation-log entry.** If the repository and reality disagree, reality wins and the documentation is fixed in the same change set.

## Stage definitions (v0.1.x)

- **Stage 0 — reconciliation** (✅ 2026-07-28): release claims reconciled with the tagged reality; ADR-0022 recorded the self-host-first operating model. Branch `docs/adr-0022-self-host-first`.
- **Stage 1 — real GitHub validation** (this plan): first contact between the shipped integration and api.github.com; evidence collected; docs/code reconciled with observations.
- **Stage 2 — soak**: DevFlow dogfoods itself on live repositories over a sustained period; observations continue in the same log. Scope defined at Stage 1 closeout.

## Ratified decisions (founder, 2026-07-29)

1. **Sequencing:** Stage 0 merges to `main` first; the Stage 1 branch cuts from `main`.
2. **Quarantine click-through is Stage 1** — both open founder gate rows in the [release checklist](../session-notes/v0.1.0-release-checklist.md) (live PR annotation; real-UI quarantine approval) close before the GitHub Release is created.
3. **Validation artifacts live together** in `docs/validation/` — this file, `predictions.md`, `observation-log.md`, `validation-report.md`.
4. **Development log:** one entry per stage within v0.1.x (the per-milestone rule, applied at stage granularity).
5. **The GitHub Release is not a Stage 1 completion criterion.** It is a founder action that follows successful validation; Stage 1 completes when the validation objectives are achieved and documented.

## Method

1. **Pre-register** — every assumption under test is a row in [predictions.md](predictions.md), written before any validation runs. Predictions are immutable once registered; only their disposition column changes.
2. **Execute** — tasks T3–T7 below, in pipeline order.
3. **Observe** — every result, expected or not, becomes an [observation-log.md](observation-log.md) entry with raw evidence (query output, log excerpt, URL, screenshot reference).
4. **Reconcile** — each discrepancy gets the minimal fix (doc or code), traced to its log entry; `pnpm verify` gates any code change; the affected validation leg re-runs after the fix.
5. **Report** — [validation-report.md](validation-report.md) is written at closeout and maps every hypothesis to its disposition and evidence.

Standing constraints: ADRs immutable (superseded, never edited); secrets never enter the repo (NEVER-5); no claim of verification that wasn't run (NEVER-8); push/PR/merge and everything requiring GitHub account actions are founder steps.

## Tasks

### T0 — Stage 0 merge (founder gate; no repo changes)

Merge the `docs/adr-0022-self-host-first` PR; cut `docs/v01x-stage1-validation` from `main`. **Evidence:** `e149df5` reachable from `origin/main`.

### T1 — Plan of record lands (docs)

This document plus [predictions.md](predictions.md) committed; `roadmap.md`'s dangling "phase plan" reference pointed here; `docs/README.md` index updated. **Complete when:** links resolve; no reference to a nonexistent phase plan remains.

### T2 — Observation log scaffold (docs)

[observation-log.md](observation-log.md) exists with format rules and entry template; [validation-report.md](validation-report.md) exists as a declared-empty skeleton. **Complete when:** both files committed; every later task claim cites a log entry.

### T3 — GitHub App configured to full spec (founder, guided; doc fixes only)

Walk [github-app-setup.md](../github-app-setup.md) §1–§6 including §3b literally: private key → `.env`, Checks read/write, OAuth client + callback, Setup URL + redirect-on-update, Installation event subscription; install on this repository and on `devflow-demo-flaky` created from `scripts/demo/flaky-repo/`. The guide itself is under test — any divergence from the real GitHub UI is fixed in the guide, observation-logged. **Complete when:** the worker boots with real credentials (its config hard-requires App ID + key). **Evidence:** worker startup log; both installations visible on the App page.

### T4 — Inbound reality: webhooks, installation lifecycle, redelivery

Real deliveries persisted; `installations` rows synced from real installation events; one real redelivery absorbed as a duplicate (ADR-0005 against real retries). **Evidence:** `webhook_events` rows with real GUIDs; Recent Deliveries UI 2xx; post-redeliver query showing one row per GUID.

### T5 — Outbound reality: token dance + artifact pipeline (first real api.github.com calls)

Trigger a real dogfood CI run (this repo uploads `test-results` JUnit artifacts); observe the first real token exchange, artifact listing, 302 zip download, parse, persist. Exercises H1–H6. **Complete when:** `workflow_runs.processing_status = 'succeeded'` for a real run with a plausible `test_results` count. **Evidence:** the §6 verification SQL output; worker log correlated by delivery GUID; GitHub run URL.

### T6 — Live detection + PR annotation (release-checklist gate row 1)

On `devflow-demo-flaky`: open a PR, force a same-commit divergence (re-run the failed job), verify the neutral check run on the real Checks tab and PATCH idempotency on a further delivery (still exactly one check). Exercises H7, opportunistically H8. **Complete when:** DB `flake_check_run_id` equals the ID in the real check's URL; no duplicate check. **Evidence:** PR/check URLs, screenshot, DB row.

### T7 — Real login, claim, dashboard, live feed, quarantine click-through (gate row 2)

Real GitHub OAuth login through the Auth.js shim; installation claimed through the real Setup-URL redirect; `pnpm demo:seed` re-run attaches the waiting unclaimed demo data; live feed observed during real traffic; quarantine approved in the real UI. Exercises H9–H11. **Complete when:** session and claim rows exist; dashboard shows real repos; a quarantine decision row exists from a real UI click. **Evidence:** DB rows, screenshots, log entries.

### T8 — Reconciliation and closeout (docs; code only where the log demands)

Release-checklist gate rows flipped ✅ with evidence links; roadmap Stage 1 status; development-log Stage 1 entry appended; handoff + session-history updated (retro-covering Stage 0's missed handoff update); [validation-report.md](validation-report.md) completed. **Complete when:** the exit criteria below all hold.

## Stage 1 exit criteria (ratified basis: founder rulings of 2026-07-29)

Stage 1 is complete when all of the following hold, each backed by an observation-log entry or repository evidence:

1. **App at full spec.** The GitHub App is configured per [github-app-setup.md](../github-app-setup.md), walked literally end-to-end; every divergence found between the guide and the real GitHub UI is fixed in the guide within the stage.
2. **Every hypothesis dispositioned.** Every row of [predictions.md](predictions.md) carries a final disposition — `confirmed`, `doc-fix`, `code-fix`, or `not-observable` (with recorded rationale); none `pending`. Fixes are merged and traced to observation-log entries.
3. **The MVP loop demonstrated against reality.** The roadmap's MVP definition executed literally on real GitHub: install → push → run ingested → JUnit parsed → flake detected and scored → PR check annotates → quarantine approved in the dashboard → live feed shows activity.
4. **Both founder gate rows closed.** Live PR annotation and the real-UI quarantine click-through are ✅ in the release checklist with evidence links.
5. **No silent changes.** Every code diff made during the stage traces to an observation-log entry; `pnpm verify` green and `pnpm e2e` 21/21 after the final change.
6. **Documentation reconciled.** [validation-report.md](validation-report.md) is complete and internally consistent; release checklist, roadmap, development log, handoff and session-history reflect the observed reality; no document contradicts an observation.

**Explicitly not Stage 1 completion criteria:** the GitHub Release (a founder action that follows successful validation), the Stage 2 soak, and the Dependabot majors queue (D-M6-6, its own v0.1.x work item).

## Done before v0.2.0 (phase exit clauses — draft, founder ratification pending)

Recorded here because the roadmap's phase entry points to them; these gate the whole v0.1.x phase, not Stage 1:

1. Stage 1 exit criteria met (above).
2. Stage 2 soak completed over a founder-defined period of real usage, with every soak observation dispositioned in the shared log.
3. The Dependabot majors queue worked, individually (D-M6-6/D13).
4. Founder release actions completed: GitHub Release published from the CHANGELOG; demo video recorded (deferred alongside it in Stage 0's reconciliation).
