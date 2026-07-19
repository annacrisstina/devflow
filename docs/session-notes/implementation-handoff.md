# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-07-19 (M6 in progress on `feat/self-host-release`; three components committed)

## Current repository status

- **Branch `feat/self-host-release`** (from `main` = `6e8162b`, the M5 merge = **PR #10**): **Milestone 6 in progress.** Committed components, each verified before commit:
  1. Observability — worker health server + Prometheus metrics on both processes (ADR-0021).
  2. The scripted e2e harness promoted into the repo (`pnpm e2e`, `scripts/e2e/`).
  3. **Containerized self-hosting (ADR-0020)** — multi-stage Dockerfiles (api bakes dashboard + migrations + embedding model; worker bakes the model), one-shot `migrate` service, compose `full` profile, `docs/self-hosting.md`. Verified live: both images build, `--profile full up` reaches healthy on all services, migrate converges idempotently, SPA + `/metrics` + webhook rejection smoke-checked, dev-infra default untouched.
- **⚠️ Process gap, on record:** the M6 architecture review lived only in the session that was killed by the Docker crash (see below) — **it never reached the repo**. ADR-0020/0021 carry the decisions that shipped. The **remaining M6 scope has no recorded, founder-approved design**: per the milestone workflow, the next session must reconstruct/produce that design from repository state and get founder sign-off before implementing further components.
- Milestones 0–5 merged (PRs #6–#10). Dependabot queue unchanged (5 PRs, per D13).

## What remains in Milestone 6 (roadmap scope, design pending)

- Seed/demo data + synthetic flaky-repo generator; **the parked backfill decision belongs to this design step**.
- Dogfooding DevFlow on its own CI.
- Docs polish: architecture diagrams from real code; README self-host pointer.
- Demo video; CHANGELOG + v0.1.0 tag.
- Founder steps standing from M4/M5: GitHub App reconfiguration + real-GitHub login/claim pass; optional live-LLM key check; **a full-profile boot with real App credentials** (this session verified with throwaway creds).

## The 2026-07-19 Docker crash and recovery (this machine)

The Docker daemon died mid-M6-session (during component 3 verification) and was recovered by the founder; the crash **corrupted Docker's image store and wiped the `postgres-data` volume**:

- The pgvector `pg17` layer chain had files truncated to 0 bytes (`docker-entrypoint.sh`, the `postgres` binary, `gosu`), and the corrupt extracted snapshots survived every `rmi`/re-pull cycle (stale containerd leases from 2025 pin them; content-store blobs re-verify clean — the corruption is in the unpacked layers + image metadata, e.g. `docker images` shows pgvector created 1970/14.7 kB).
- **Workaround in effect:** `pgvector/pgvector:0.8.0-pg17` (clean, different layer chain) pulled and **locally retagged as `pgvector/pgvector:pg17`** — compose is unchanged and uses the local tag. pgvector extension is 0.8.0 (was 0.8.5). To restore upstream later: `docker rmi` both tags and re-pull; if the corrupt chain resurfaces, purge Docker Desktop data (Troubleshoot → Clean/Purge) — nothing precious lives in it beyond this project's dev volumes.
- The dev database was empty after recovery (fresh initdb); **migrations 0000–0004 were re-applied** — schema is current, but any accumulated dev/dogfood data is gone.
- The crash also left a mid-word edit in `apps/api/src/routes/webhooks.ts` (comment split in two); reverted from git before anything else.

### Verification actually run this session (not asserted)

- `pnpm verify` green (12/12 turbo tasks; 94 api tests among them) — run twice, the second covering the new `warm-model.ts`/docs after a prettier fix; the commit itself was `verify && commit`-gated.
- Both images built from scratch; contents inspected (23 MB model at `/app/models` in both, `dist/{server,migrate,warm-model}.js`, SPA, migrations, `USER node`).
- Live full-profile boot with throwaway credentials (scratch `--env-file`, founder `.env` untouched): postgres/redis/api/worker healthy, migrate exited 0 idempotently; `/healthz` 200, SPA HTML served, 22/19 `devflow_` metric lines (api/worker), unsigned webhook 400 per ADR-0005. Full-profile containers removed after; dev infra left healthy.

## Open founder items

1. **Review the three M6 component commits** (especially ADR-0020 + `docs/self-hosting.md`) — ADR-0021 was flagged for explicit review in-session; ADR-0020 was authored during the resumed session against the lost design's evidence trail.
2. **Green-light the M6 remaining-scope design step** (must settle backfill; see the process gap above).
3. Standing: GitHub App reconfiguration + real-GitHub pass (github-app-setup.md §3b); optional live-LLM key check; Dependabot queue (5 PRs).

## Known technical debt (accepted, tracked)

Unchanged from M5 (C2 commitlint install scope; reactive rate limiting; docker-less `pnpm verify` fails at tests; M3/M4 items; M5 items), plus:

- pgvector version drift on this machine only (0.8.0 local retag vs upstream `pg17` — see crash notes).
- `docker compose --profile full down` also stops dev infra (compose semantics); teardown used targeted `docker rm` instead — a compose-doc nuance, not a bug.

## Environment notes (this machine)

- WSL2; repo on `/mnt/d` (drvfs) — slow fs; **poll, never sleep-once**; check port ownership before trusting curl; spawn detached process groups for e2e and verify cleanup via `ps`.
- pnpm shim: `~/.local/bin/pnpm`; `export PATH="$HOME/.local/bin:$PATH"` for Turbo.
- Node 20.19.4 host (images run Node 22 per `.nvmrc`); no `jq`, no `gh`; **push/PR/merge are founder actions**.
- GitHub username: `annacrisstina`. The founder communicates in Romanian; the repository is entirely in English.
- Docker Desktop (Windows) + WSL2, engine 28.5.1, containerd snapshotter. After the crash-recovery: watch for 0-byte-file symptoms on _old_ image chains; fresh pulls extract fine. Stale 2025 containerd leases remain (`moby-image-sha256:44bb…/f56245…/ff7a79…`) — harmless unless the corrupt-chain symptom returns.

## Things to remember before continuing

- **Milestone workflow + NEVER list** ([implementation-rules.md](../project-memory/implementation-rules.md)); docs land on the milestone branch before the PR; verify-gated commits (`&&`); no AI-attribution trailers.
- **The remaining-M6 design step comes first** — do not implement seed/demo/dogfood/release components against the lost, unrecorded design (NEVER-3).
- The AI boundary stays mechanically reviewable (ADR-0017): new `@devflow/ai` imports only at enumerated seams — the api `warm-model.ts` added this session is the same seam class as the worker's (build-time model warmer).
- Update this file every session; dev-log at milestone completion; project memory on significant decisions.
