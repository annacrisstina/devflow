# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-07-19 (M4 implemented on `feat/web-dashboard`; awaiting founder review + PR)

## Current repository status

- **Branch `feat/web-dashboard`** (created from `main` = `dc3e41f`, the M3 merge): **Milestone 4 complete** — code, tests, ADRs 0012–0016, and all documentation, committed and verified. **Push/PR/merge are founder actions** (no git credentials on this machine).
- The branch also **folds the former `docs/m3-post-merge-closeout` content** (M3 post-merge facts + the simplified-closeout amendment) — that branch and the old `chore/m2-post-merge-closeout` can be **deleted unmerged**; nothing on them is unique anymore.
- Milestones 0–3 merged on `main` (PRs #6/#7/#8); CI on `main` green. M4's architecture review was founder-approved 2026-07-19 before implementation started (design step honored).
- Local infra: compose healthy; migrations 0000–**0003** apply cleanly; no leftover e2e state (`devflow_e2e` dropped, Redis logical db 5 flushed, no leaked processes — verified via `ps`, the M3 lesson).
- **Dependabot queue (5 open PRs, unchanged):** ESLint 10, TypeScript 6, commitlint majors ×2, actions group — review individually per D13. Note: ESLint 10 / TS 6 now also touch `apps/web`.

## What Milestone 4 added (branch `feat/web-dashboard`)

- **Migration 0003 + ADR-0012:** Auth.js tables (text UUID ids — adapter contract), `workspaces`, `workspace_members`, `installations` (nullable `workspace_id` = unclaimed; backfilled from pre-M4 `repositories.installation_id`), `quarantine_records` (partial unique index on active identities). Tenancy resolves at read time (repo → installation → workspace); ingest path untouched; isolation is app-layer with a cross-tenant denial test per endpoint (RLS deferred with a written trigger).
- **ADR-0013:** `@auth/core` mounted on Fastify (`apps/api/src/auth/`), database sessions, GitHub App's own OAuth credentials. Session auth for API routes = one indexed join on the cookie.
- **ADR-0014 + `/api/v1`:** me / workspaces / repositories / flaky-tests (+detail w/ history) / runs / quarantine / claiming. `{error:{code,message}}`, limit-offset+total, bigints as strings, ISO timestamps (`@devflow/contract` is the shared type-only wire contract). **Decay-at-read** (closes the M3 stale-score debt): evidence-unwind → half-life decay → re-saturate, computed in SQL for correct ordering/filtering/pagination; SQL ≡ TS pinned by tests; same `DEVFLOW_FLAKE_*` knobs, now read by the API too.
- **Claiming:** POST `/api/v1/workspaces/:id/installations/link` → signed state → GitHub install page → Setup URL callback `/api/github/setup` verifies state+session and binds the installation. `installation` webhooks → `PROCESS_INSTALLATION_EVENT` job → worker syncs account fields / `uninstalled_at`.
- **ADR-0016 quarantine:** proposals are a query (effective-flaky ∧ no active/dismissed record); human decisions are rows; annotation stage labels actively-quarantined failing tests — conclusion stays `neutral` (ADR-0011 intact).
- **ADR-0015 live feed:** worker publishes to `devflow:live-events` (workspace resolved at publish; fire-and-forget), API Socket.IO fans out to `ws:<id>` rooms; handshake auth = session cookie; best-effort by contract (REST is truth; polling cut line stays one line).
- **`apps/web`:** Vite React SPA (react-router, TanStack Query, Tailwind), same-origin (dev proxy / prod `@fastify/static` behind `DEVFLOW_WEB_DIST`). Login → create workspace → connect → repos → ranking → detail → live runs → quarantine tabs.
- **New env** (`.env.example` documents all): `DEVFLOW_APP_URL`, `DEVFLOW_AUTH_SECRET`, `DEVFLOW_GITHUB_CLIENT_ID/SECRET`, `DEVFLOW_GITHUB_APP_SLUG`, optional `DEVFLOW_WEB_DIST`.

### Verification actually run (not asserted)

- **`pnpm verify` green: 129 tests** across db (16), queue, api (72), worker (59) — including cross-tenant denial per endpoint, ADR-0010-pinned decay arithmetic + SQL≡TS equality, signed-state tamper/expiry/theft cases, quarantine state machine, room isolation on real Redis.
- **Scripted live e2e 14/14** (script preserved this session in scratchpad; throwaway db dropped): claim → six deliveries → 0.3333/suspected (exact ADR math) → neutral suspected-flaky check → flaky 0.6 → API ranking/runs/history → proposal → approve → next check "1 quarantined…" + `human-approved quarantine`, still neutral → 21 workspace-scoped socket events → redelivery converged. Also live-verified: API serving the built SPA (index, client-route fallback, JSON 401/404 preserved).
- E2E found and fixed a real bug pre-commit: the SPA's fetch wrapper sent a JSON content-type on body-less POSTs (Fastify 400) — `fix(web)` commit.

## Open founder items

1. **Review + push + PR of `feat/web-dashboard`** (PR title is commitlint-checked; suggested: `feat(web): add dashboard, live feed and quarantine workflow`). Delete both stale closeout branches.
2. **D11 squash decision before this PR merges** (three merge commits so far): enforce squash+linear history in branch protection (recommended) or amend D11.
3. **GitHub App reconfiguration** ([github-app-setup.md §3b](../github-app-setup.md)): OAuth callback URL + _Request user authorization_ + client secret, Setup URL (+ redirect on update), subscribe `installation` events. Then the real-GitHub pass: browser login, live claim, dogfood annotations.
4. **Backfill decision** (open since M3): recommendation stands — fold into M6 demo tooling.
5. Dependabot queue (5 PRs), individually per D13.
6. **Green-light the M5 design step** (AI layer; AI-boundary + embedding ADRs due) — or reorder M6 first if hardening should precede AI.

## Known technical debt (accepted, tracked)

1. C2 (M0): commitlint CI job installs the whole workspace.
2. Rate-limit handling reactive-only; artifact pagination bounded 10×100; no worker health endpoint (ADR-0009).
3. Docker-less `pnpm verify` fails at the test leg (needs Postgres+Redis) — accepted, fixtures-over-mocks.
4. M3: per-identity score upserts in a loop; 403-on-unapproved-permissions retries into the DLQ (ADR-0011).
5. M4: effective-score SQL in ORDER BY/WHERE per list request (cached column = recorded escape hatch); socket rooms join at connect time only; duplicate dismissed rows possible under race (harmless); no automated UI tests (stated in apps/web README).

## Environment notes (this machine)

- WSL2; repo on `/mnt/d` (drvfs) — slow fs; cold server start up to ~16s: **poll, never sleep-once**; check port ownership before trusting a green curl. Killing `pnpm exec` children **orphans the tsx grandchild** — spawn detached process groups and kill the group (e2e does this now), and verify death via `ps`.
- pnpm shim: `~/.local/bin/pnpm` (corepack, no sudo); Turbo needs it on PATH: `export PATH="$HOME/.local/bin:$PATH"`.
- Node 20.19.4 (`.nvmrc` targets 22; floor `>=20.19.0`). No `jq` (use `node -e`), no `gh` (public-API reads via curl work), no non-interactive git credentials — **push/PR/merge are founder actions**.
- GitHub username: `annacrisstina`. Contact email: rohike.contact@gmail.com.
- pg polls: `rowCount` can be 0 — poll on truthiness of the _condition_, not on "query returned".

## Things to remember before continuing

- **Milestone workflow + NEVER list** ([implementation-rules.md](../project-memory/implementation-rules.md)): design before files, run verifications for real, founder confirmation at milestone boundaries, PRs only, no AI-attribution trailers in commits, gate commits on verify with `&&`.
- **No post-merge closeout branches** (post-M3 amendment, in force): milestone docs land on the milestone branch before the PR — this file, dev-log, memory, ADRs all updated _here_, as done for M4.
- Update this file every session; dev-log every milestone; project memory on significant decisions.
- The founder communicates in Romanian; the repository is entirely in English.
- **Next after M4 merges: M5 (AI layer) — design step first, on the founder's go.** M5's amputable-AI interface should sit behind the seam recorded in architecture-context (delete the layer, product still works).
