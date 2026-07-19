# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-07-19 (M5 implemented on `feat/ai-insights`; awaiting founder review + PR)

## Current repository status

- **Branch `feat/ai-insights`** (from `main` = `0abdd19`): **Milestone 5 complete** — code, 158 tests, ADRs 0017–0019, all documentation, committed and verified. **Push/PR/merge are founder actions.**
- **M4 post-merge facts (recorded here per the no-closeout-branch rule):** merged to `main` as **PR #9** (merge commit `0abdd19` — the _fourth_ merge-commit-not-squash; the founder has ruled D11 a governance matter, not an implementation blocker: ignore during milestones). CI on merged `main` verified green via the public checks API. The remote feature branch was deleted; the two stale local closeout branches were deleted at M5 branch setup (their content lives in `main`).
- Milestones 0–4 merged (PRs #6–#9). M5's architecture review was founder-approved 2026-07-19 with one early-validation gate (local embedding performance) — **passed with measured numbers** (below).
- Local infra: compose healthy; migrations 0000–**0004** apply cleanly (0004 creates the `vector` extension); no leftover e2e state (db dropped, Redis db 5 flushed, `ps` clean).
- **Dependabot queue (5 open PRs, unchanged),** rebased onto current main; individually per D13.

## What Milestone 5 added (branch `feat/ai-insights`)

- **`@devflow/ai` (ADR-0017):** the amputable AI layer — MiniLM embedder (quantized ONNX, 384 dims, lazy), failure-text normalization + sha256 content hashing, single-link clustering over Float32Arrays, plain-fetch Anthropic provider (injectable, ADR-0009 pattern). Call sites are enumerated in ADR-0017; `grep -r "@devflow/ai" apps packages` must return only those.
- **Spike measurements (the founder gate):** ~25 MB one-time download, ~0.4 s warm load, ~150 MB RSS, 2–6 ms/text, paraphrases 0.79–0.82 vs unrelated 0.22–0.23 cosine. `onnxruntime-node` works with pnpm's script-blocking intact (no D13 exception).
- **Migration 0004 (ADR-0018):** `CREATE EXTENSION vector`, `test_results.failure_hash` (partial index), content-addressed `failure_embeddings` (unique repo+hash), `ai_hypotheses` (identity copied, provenance columns). Worker embedding stage after detection: flag-gated (`DEVFLOW_AI_EMBEDDINGS`), bounded (`DEVFLOW_AI_EMBED_MAX_PER_RUN`), failure-isolated (never fails ingestion), convergent under reprocess.
- **API:** `GET /search?q=` (query embedded in-process, exact cosine in pgvector, workspace-scoped, occurrences + affected tests joined); `GET /repositories/:id/failure-clusters?days=` (windowed ≤1000 vectors, threshold `DEVFLOW_AI_CLUSTER_THRESHOLD`); `POST|GET /flaky-tests/:scoreId/hypothesis` (ADR-0019: human-triggered, digest-cached, `force` regenerates, 501 without key, 502 on upstream failure without disturbing the cache); `/api/v1/me` grew `features: {aiSearch, aiHypotheses}`.
- **Web:** Insights page (search + clusters, feature-gated nav) and the hypothesis panel on test detail (provenance + "AI-generated hypothesis — verify before acting").
- **CI:** model directory cached (`actions/cache` SHA-pinned); `DEVFLOW_AI_MODEL_DIR` in turbo's strict test env.
- **New env** (`.env.example`): `DEVFLOW_AI_EMBEDDINGS`, `DEVFLOW_AI_MODEL_DIR`, `DEVFLOW_AI_EMBED_MAX_PER_RUN`, `DEVFLOW_AI_CLUSTER_THRESHOLD`, `DEVFLOW_AI_API_KEY` (no default, ever), `DEVFLOW_AI_MODEL` (default `claude-haiku-4-5`), `DEVFLOW_AI_BASE_URL`.

### Verification actually run (not asserted)

- **`pnpm verify` green: 158 tests** — ai 21 (real-model embedder; clustering on synthetic vectors; LLM client wire shape), worker 71 (embedding stage semantics incl. reprocess convergence and swallow-on-failure), api 91 (search/clusters/hypothesis with cross-tenant denial on every new endpoint; stub Anthropic server through the real client), db 16, queue.
- **Scripted live e2e 22/22** (M4 regression flow intact + M5): 3 distinct failure texts embedded with hashes stamped; **real MiniLM** ranked both timeout paraphrases (0.72/0.69) above the redis failure (0.26); clusters split 2+1; hypothesis via stub LLM with provenance and cache semantics; prompt carried the untrusted-data instruction. E2E state fully cleaned after (db dropped, redis flushed, `ps` verified — the leaked-process discipline).

## Open founder items

1. **Review + push + PR of `feat/ai-insights`** (suggested title: `feat(api): add assistive AI layer with semantic failure search`). D11 is founder-ruled governance — no action needed from implementation.
2. **Optional live-LLM pass:** put a real `DEVFLOW_AI_API_KEY` in `.env`, click Generate on a flaky test, sanity-check the hypothesis (ADR-0019's founder step).
3. **Standing from M4:** GitHub App reconfiguration (github-app-setup.md §3b) + the real-GitHub login/claim/dogfood pass.
4. **Backfill decision** — still parked; M6 (next) is the recommended home, and its design step should settle it.
5. Dependabot queue (5 PRs), individually per D13.
6. **Green-light the M6 design step** (production hardening + release: one-command compose, seed/demo + backfill, observability polish, docs/diagrams, demo video, v0.1.0).

## Known technical debt (accepted, tracked)

1. C2 (M0): commitlint CI job installs the whole workspace.
2. Rate-limit handling reactive-only; artifact pagination bounded; no worker health endpoint (ADR-0009) — M6 candidates.
3. Docker-less `pnpm verify` fails at the test leg (needs Postgres+Redis) — accepted.
4. M3/M4 items unchanged (per-identity score upserts; 403→DLQ on unapproved Checks permission; effective-score SQL per list request; socket rooms join at connect; no automated UI tests).
5. M5: whitespace-only failure-text normalization (better normalization = a hash migration, recorded); clustering O(n²) at the 1000-vector cap (sub-second measured); in-process query embedding (~0.4 s first-search load per API process); air-gapped deploys pre-seed `DEVFLOW_AI_MODEL_DIR`.

## Environment notes (this machine)

- WSL2; repo on `/mnt/d` (drvfs) — slow fs; **poll, never sleep-once** (and poll on the _condition's truthiness_ — pg `rowCount: 0` is not false); check port ownership before trusting curl; `pnpm exec` children orphan tsx grandchildren — spawn detached groups, kill the group, verify via `ps`.
- pnpm shim: `~/.local/bin/pnpm`; `export PATH="$HOME/.local/bin:$PATH"` for Turbo.
- Node 20.19.4; no `jq`, no `gh`; no git credentials — **push/PR/merge are founder actions**.
- GitHub username: `annacrisstina`. The founder communicates in Romanian; the repository is entirely in English.
- The MiniLM model is cached locally (package cache) — spikes and e2e runs are warm (~0.4 s load).

## Things to remember before continuing

- **Milestone workflow + NEVER list** ([implementation-rules.md](../project-memory/implementation-rules.md)); docs on the milestone branch before the PR; verify-gated commits (`&&`); no AI-attribution trailers.
- **The AI boundary is reviewable mechanically** (ADR-0017): any new `@devflow/ai` import outside the enumerated seams is a violation — check it in every review touching AI code.
- Update this file every session; dev-log every milestone; project memory on significant decisions.
- **Next after M5 merges: M6 — production hardening + release** (design step first, on the founder's go; the backfill decision belongs in that design).
