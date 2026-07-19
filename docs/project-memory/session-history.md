# Session History

> Part of the [project memory](../README.md#project-memory). A chronological engineering history of how DevFlow came to be — the questions asked, the alternatives explored, the ideas rejected and _why_. This exists because decision context evaporates: six months from now, "why not X?" must have a written answer. Deliberately not brief.

## Prehistory (before 2026-07-14, reconstructed)

Across earlier design sessions (whose full transcripts are lost — the trigger for creating this very document), the founder and the AI tech-lead:

- Abandoned **Pulse** (an earlier project idea; details not preserved).
- Fully designed **StudyRooms**: a collaborative exam-preparation platform for students, with three pillars — AI engineering (RAG over course materials + mock exam generation + hybrid grading), a learning system (mastery tracking), and real-time collaboration (WebSockets, live study sessions, presence). Product definition, killer features, MVP boundaries, GitHub strategy, monorepo layout, ADR practice, README standards, GitHub Flow, Conventional Commits and a provisional tech stack were all settled.
- Settled tech preferences that later survived into DevFlow (re-validated, not blindly inherited): workspace-based multi-tenancy, Auth.js + Postgres, Fastify + Drizzle, Socket.IO self-hosted + pgvector.

**Lesson recorded:** the loss of those transcripts caused repeated re-litigation and wasted sessions. Persistent, repo-resident memory (this directory) is the fix.

## Session of 2026-07-14 — the day of the pivot and Milestone 0

### Phase 1: Attempted continuation, context loss surfaces

The founder asked to resume StudyRooms at "S2.B" (data model, PostgreSQL schema, RLS, multi-tenancy, API design, auth). The tech lead disclosed honestly that prior-session context was gone and, rather than guessing, asked four locking questions (multi-tenancy model, auth provider, backend+ORM, realtime+vector strategy). Answers: workspace-based; Auth.js+Postgres; Fastify+Drizzle; Socket.IO+pgvector. These carried forward into DevFlow.

### Phase 2: The reality check — StudyRooms vs DevFlow

Before architecture began, the founder requested a brutal comparison from a hiring-manager perspective: StudyRooms vs "DevFlow (Developer Productivity Platform)", scored on 16 axes, optimized exclusively for CV/GitHub/interviews.

**Result: DevFlow 132 — StudyRooms 100.** The decisive arguments:

1. **Category pattern-matching:** "developer productivity platform" reads as Linear/Sentry/B2B-SaaS to recruiters; "collaborative exam prep" reads as bootcamp/hackathon EdTech — same code quality, different prestige universe, and you can't change a category's perception from inside it.
2. **Event-driven is native vs bolt-on:** target companies run on event-driven infrastructure; DevFlow _is_ webhook ingestion + queues by nature; StudyRooms would have faked it.
3. **Third-party integrations are the real seniority test** (OAuth dances, HMAC verification, retries with jitter, rate limits, DLQs) — DevFlow forces them, StudyRooms avoids them.
4. **Completion probability:** StudyRooms' three independent pillars each had to work for the story to hold (~6–9 months realistically); DevFlow's incremental integration model demos in weeks.
5. **AI is table stakes in 2026:** "RAG on the CV" no longer differentiates; disciplined AI does.
6. StudyRooms' genuine strengths (collaborative frontend, presence/CRDT) transfer only to Figma/Notion/Linear-type companies — none on the target list.

**Decision: pivot to DevFlow.** Recorded insight: the time invested in StudyRooms was not wasted — engineering discipline artifacts (ADR practice, monorepo strategy, conventions) transferred wholesale; only domain modeling was reset.

### Phase 3: What is DevFlow, concretely? First proposal: Incident Response Platform

Constraints set by the founder: no GitHub dashboard, no Jira/Linear clone, no AI wrapper; real problem, daily use, maximal engineering surface.

The tech lead proposed and fully defended **an open-source incident response platform** (incident.io/Rootly category): auto-assembled incident timelines from GitHub/Sentry/Slack events, real-time war-rooms with Incident Command System roles, grounded postmortem generation (every AI claim citing a timeline event ID). Product definition was complete: users (on-call engineer P0, EM P1), killer features, MVP with three integrations, explicit non-goals (no paging, no status pages — consume PagerDuty, don't replace it), AI banned from severity classification and root-cause verdicts.

**Rejected by the founder** on one argument the 16-axis scoring had underweighted: **authenticity**. A third-year student has never been on-call and never written a postmortem; the domain cannot be credibly defended under interview questioning, and daily-use for incidents is weekly at best. Two alternatives offered alongside (deploy regression detector à la Sleuth; async-job observability "Sentry for queues") were noted but not pursued — the first lacked real-time substance, the second lacked recruiter legibility.

**Principle extracted and made standing:** _build in a domain where you are genuinely the user._

### Phase 4: Final selection — CI Reliability Platform

The founder asked for a single, defended, hiring-decision-style recommendation (explicitly: no menus). Requirements: keep every identified competency (OAuth, GitHub API, webhooks, event-driven, workers, queues, observability, disciplined AI, WebSockets, CI/CD, Docker, Postgres, Redis, production engineering), be authentic for a student, be daily-use, be finishable in 3–4 months.

**Recommendation: DevFlow = CI reliability platform for GitHub Actions — flaky test detection, quantification and quarantine.** Why it won:

- **Authenticity:** every student using GitHub Actions has personally hit flaky tests; the founder is the user.
- **Daily use = push frequency** — structurally daily, unlike incidents (weekly) or exams (seasonal).
- **Demo-ability:** GitHub Actions runs/artifacts on public repos are readable via API — real data from real OSS repos, no fictional company to simulate.
- **Same gap coverage as incident response with one critical integration instead of three** → materially higher completion probability.
- **A real market gap:** BuildPulse/Trunk/Datadog CI are closed SaaS; no serious OSS alternative exists.
- Google's published flaky-test numbers (~16% of tests) give the problem statement external credibility.

Risks recorded with mitigations: detection needs data volume (→ backfill + public-repo demos + synthetic flaky generator); report format diversity (→ JUnit XML only in v1); single CI provider (→ adapter seam, extensibility by design not code); false positives (→ conservative thresholds, human-approved quarantine).

**Also in this phase:** persistent memory files were created outside the repo (assistant-level), and a standing rule was set — this was the **third** re-litigation of project choice; a fourth requires a technical blocker, not a better idea. The differences between the final candidates were ~10–15%; the difference between _any of them finished_ and _any of them abandoned at 60%_ is ~500%. The choice loop itself had become the biggest risk.

### Phase 5: Milestone 0 — repository foundation

Product locked; roles formalized (founder = product owner; AI = lead engineer under a strict milestone workflow: goal → design decisions → files → run verification → suggest commit → wait for confirmation).

Delivered: monorepo (pnpm 10 + Turborepo 2), ESLint 9 flat + Prettier + commitlint (strict scope enum), GitHub Flow with squash-merge (and therefore PR-title linting in CI), compose with `pgvector/pgvector:pg17` + Redis 7 AOF, governance docs, ADR-0001 (record decisions) + ADR-0002 (monorepo), doctor script, CI skeleton. All verifications **run, not asserted**: install (204 packages), format/lint green, compose healthy, pgvector 0.8.5 confirmed via `CREATE EXTENSION`, commit message pre-validated against commitlint.

Environment facts recorded: WSL2 with repo on `/mnt/d` (drvfs — slow FS, ~1m42s install; recommendation to move to ext4 stands), Node 20.19.4 local (out of LTS since 2026-04; `.nvmrc` targets 22), `corepack enable` needs sudo (worked around via `corepack pnpm`).

### Phase 6: Repository Readiness Review (adversarial self-review)

The founder requested a formal Staff-level review before any feature branch. The review **withheld approval** — finding real defects in the reviewer's own prior work, including:

- **[BLOCKER] Mutable action tags** in CI — supply-chain vector (tj-actions incident cited) — especially embarrassing for a CI-reliability product.
- **[BLOCKER] No Dependabot config** despite majors already available at install time.
- **[BLOCKER] `@OWNER` placeholders** still live in CODEOWNERS/README.
- **[BLOCKER] No issue templates** (and no security routing away from the public tracker).
- **[MAJOR] CODE_OF_CONDUCT missing**; **[MAJOR] vacuous CI gates** (typecheck/test with zero packages) — resolved by honest disclosure rather than fake substance.
- **[MINOR]** ports not loopback-bound; `.vscode` fully ignored.
- Process finding: the "PR" under review had never actually been committed.

### Phase 7: Remediation + approval

All findings fixed and **re-verified from scratch** (each check re-run against actual file state): placeholders → `annacrisstina` (existence verified via GitHub API, HTTP 200); actions pinned to full SHAs fetched live from the GitHub API — catching a real trap: `pnpm/action-setup@v4.0.0` is an **annotated tag**, whose ref SHA is a tag object, not the commit; the commit was dereferenced via the commits API. Dependabot (grouped weekly, majors individual), Issue Forms + security-routing config, Contributor Covenant 2.1, committed `.vscode`, loopback-bound ports, plus self-initiated additions: `.gitattributes` (LF normalization — real risk on Windows/WSL), `.npmrc engine-strict`, compose validation step in CI. Considered and rejected: actionlint (one more pinned dependency for one workflow), CHANGELOG (pre-release), commit signing (personal setting, not repo).

**Milestone 0 Approved**, confidence 92% — the withheld 8%: CI has never run on GitHub itself (5%), manual GitHub settings pending first push (3%).

### Phase 8: Memory preservation (this document set)

The founder directed creation of `docs/project-memory/`, `docs/session-notes/implementation-handoff.md` and `docs/development-log.md` as the project's permanent memory, with an explicit update contract (memory on decisions; handoff every session; log every milestone). Rationale: chat history is ephemeral and already failed once (Phase 1); the repo itself must carry the project's reasoning.

## Session of 2026-07-17 — Milestone 1 architecture review

The founder confirmed M0 as committed/pushed (`3a7116a` — note: with subject `chore: initial project setup`, not the suggested message; harmless, pre-dates CI enforcement), declared the foundation **frozen**, and opened Milestone 1 with an explicit Phase-1-first instruction: full design as an architecture review document, no implementation until approved.

The review document covered scope (in/out with landing milestones for everything deferred), components, the end-to-end request flow (authenticate raw bytes → parse → atomic idempotent persist → fast ACK; 500 on db-down because GitHub redelivery is the recovery path), security posture (constant-time HMAC before any interpretation, body limits, no rate limiting as a stated accepted risk, App private key kept out of M1 entirely), the `webhook_events` design (all column-level decisions pre-argued), risks (smee re-serialization, GUID semantics vs manual redelivery, raw-body capture pitfalls), and a 5-step implementation order with per-step verification.

**Founder approved with a scope trim** — the operative M1 goal became exactly: Fastify API, Drizzle db package, webhook endpoint, HMAC verification, raw persistence, basic end-to-end verification; everything else minimal. Process set: one component at a time, founder review between components.

## Session of 2026-07-18 — Milestone 1 implementation

- **Component 1 (`packages/db`)** built and verified (migration applied and inspected, integration tests on a recreated-from-migrations throwaway DB, CI gate proven by a deliberate red). Founder reviewed and approved, then **authorized autonomous continuation** through M1 (stop only for architectural decisions, blockers, or completion).
- **ADR renumbering versus the review doc:** Drizzle's ADR became 0003 (shipped with component 1, per ADRs-land-with-their-code); Fastify 0004, ingestion model 0005, GitHub App 0006.
- **Component 2 (`apps/api`)**: Fastify skeleton, env-schema config (webhook secret required, never defaulted), pino, `/healthz`, graceful shutdown; served and SIGTERM-drained for real.
- **Component 3 (webhook endpoint)**: scoped raw-body parser, constant-time HMAC, idempotent insert; 13 tests total including tampered/duplicate/malformed cases on a recorded-shape fixture.
- **Component 4**: GitHub App setup guide (least-privilege, no private key in M1) + live end-to-end: signed compact payload → public smee.io channel → local API → row in Postgres; duplicate GUID absorbed; tampered and unsigned junk rejected with zero rows.
- **Deviation, recorded:** no git credentials available to the engineer → per-component PRs impossible; components landed as sequential commits on `feat/db-webhook-events`, founder to push and open the PR.
- Incidents worth remembering: `URL.pathname` vs space-containing repo path (fixed with `fileURLToPath`); a stale server holding port 3001 made a dead process look healthy (check port ownership before trusting curl); smee re-serializes JSON so tunnel HMAC only verifies for canonical-compact bytes; `corepack enable --install-directory ~/.local/bin` solves the sudo problem and is required because Turbo spawns `pnpm` from PATH.

## Session of 2026-07-18 (later) — Milestone 2 design and implementation

M1 was merged to `main` as PR #6 — with a **merge commit**, not the prescribed squash (flagged to the founder: branch-protection settings should enforce squash/linear history if that discipline stands). Dependabot opened ESLint 10 and TypeScript 6 major PRs (awaiting individual review per D13).

**Design:** a full M2 architecture review (goals/scope, components, flow, packages, schema, worker design, GitHub integration, JUnit flow, order, risks) was approved with a founder minimalism directive — functional pipeline, minimum required complexity, no optional optimizations — and six explicit decisions ratified: tenancy deferral to M4, no partitioning (documented triggers), in-house GitHub client over Octokit, scan-all-artifacts discovery, replace-per-run idempotency, and the housekeeping notes.

**Implementation** (six components, sequential commits on `feat/artifact-pipeline`):

1. `@devflow/queue` + API producer (enqueue-after-persist, duplicate path re-enqueues → redelivery repairs lost jobs) + Redis in CI + ADR-0007.
2. Normalized schema (4 tables, migration 0001) + ADR-0008.
3. Worker skeleton: load-event → normalize-run with convergent upserts; permanent-vs-transient failure taxonomy; BullMQ round-trip tested.
4. In-house GitHub client + ADR-0009 — hand-rolling the JWT surfaced the **PKCS#1 gotcha** (GitHub's keys aren't PKCS#8; `node:crypto` accepts both, jose doesn't).
5. Streaming JUnit parser (saxes) + zip scan (yauzl, size caps) + replace-per-run persistence; fixture corpus (jest/pytest/surefire/nested/parameterized/not-junit/malformed).
6. **Local full-stack e2e:** API + Redis + worker + Postgres + stub GitHub API serving a fixture-built zip — signed webhook → 202 → 8 result rows (6/1/1 by status, matching fixtures) → redelivery converged. 51 tests total, `pnpm verify` green throughout.

Notable incidents: pnpm strictness caught a phantom `ioredis` type import (the M0 tooling argument, vindicated); one commit briefly landed on a red verify because `;` chained what `&&` should have gated (amended, lesson logged); Node's global fetch ignores npm-undici's MockAgent (hence injectable `fetchImpl`).

## M2 merge + post-merge closeout (2026-07-18)

Before pushing, the founder directed removal of all `Co-Authored-By`/AI-attribution trailers from the unpushed history — done via `git filter-branch --msg-filter`, content verified byte-identical; the previously pushed M1 history turned out to already be trailer-free. M2 then merged to `main` as **PR #7** — again a merge commit rather than squash (second occurrence; the recommendation to enforce squash/linear-history in branch protection stands, or D11 should be consciously amended to match actual practice). **CI on merged `main` verified green via the public checks API — first successful run of the Postgres + Redis service containers on GitHub runners**, closing the last unproven claim from the M2 verification. Dependabot queue grew to five branches (ESLint 10, TypeScript 6, commitlint majors ×2, actions updates). Roadmap/dev-log/handoff updated to the merged state.

## Session of 2026-07-18 (later still) — Milestone 3 design and implementation

_The session was interrupted mid-implementation and resumed from repository state alone (the handoff + uncommitted work on `feat/flakiness-detection`) — the first real test of the memory system for an in-flight milestone, passed._

**Design:** ADR-0010 (flakiness detection — the ADR the product exists for) fixed the model before implementation: two unequal evidence signals (same-commit divergence 1.0, default-branch transition 0.25), exponential decay, saturating score, reference arithmetic pinned in unit tests, always-failing-scores-zero as a structural property. ADR-0011 fixed delivery: neutral-only check run, silence when nothing to say, PATCH idempotency via `flake_check_run_id`.

**Implementation** (on `feat/flakiness-detection`): migration 0002 (`test_flake_scores`, `repositories.default_branch`, `workflow_runs.flake_check_run_id`); pure `score.ts` + event-driven `detection-stage.ts` (recompute set = failed-now ∪ non-healthy-present, 90-day bounded reads, worst-status-per-run aggregation); annotation stage + `createCheckRun`/`updateCheckRun` on the in-house client; `DEVFLOW_FLAKE_*` config with cross-field boot validation; pipeline gating (detection only after results persist; annotation failures never fail ingestion).

**Verification:** 72 tests green (up from 51), full `pnpm verify`, and a scripted live e2e (API + worker + Postgres + Redis + stub GitHub): three signed deliveries forming a same-commit divergence → score 0.3323/`suspected` matching the ADR math exactly → one neutral check run with the plain-language evidence table; redelivery converged without duplicating the check.

**Recorded for the founder:** installation-time backfill (roadmap M3 scope) deliberately deferred pending its own design pass; the jobId-dedup redelivery nuance (completed jobs don't reprocess while retained — M2-documented behavior observed live); ADR-0011 was authored this session and deserves explicit founder review before the PR merges.

Notable incidents: drizzle raw-SQL selections bypass column mapping (timestamp came back as a string — caught by integration tests on real Postgres); generation tooling emitted literal NUL bytes where `\u0000` escapes were intended (caught with `cat -A`).

## M3 merge closeout (2026-07-18)

M3 merged to `main` as **PR #8** ("feat(worker): add flakiness detection", merge commit `dc3e41f`) — the **third** merge-commit-not-squash occurrence; the standing recommendation (enforce squash/linear history in branch protection, or consciously amend D11) remains unactioned and should be resolved before M4's PR. CI on merged `main` verified green via the public checks API. One CI wrinkle on the branch: commitlint's **Lint-PR-title** step failed (the quality gates were green — the guard built in M0 for squash-commit subjects did its job even though the eventual merge wasn't a squash); the founder corrected the title and re-triggered with an empty `chore: rerun CI` commit, since a title edit alone doesn't re-run the check. By merging, ADR-0010 and ADR-0011 are founder-approved. Housekeeping completed: all merged remote feature branches deleted (a standing item since M2). Still open: backfill scope decision, Dependabot queue (5 PRs), real-GitHub verification with Checks:write. Next: M4 design step, on the founder's go.

## Session of 2026-07-19 — Milestone 4 design review and implementation

_The session opened with a memory-system stress test the system passed: the founder initially asserted that the M4 architecture review "was already approved", but the repository (handoff, session history, open items) recorded that the design step had not started, and no review document or tenancy/auth ADRs existed anywhere in the repo or its branches. Per "repository documentation is the single source of truth", the contradiction was surfaced instead of implementing against an unrecorded design; the founder then requested the review be produced from repository state alone._

**Design:** the full M4 architecture review was produced and **founder-approved**, with one adjustment: branch from `main`, not from the leftover `docs/m3-post-merge-closeout` branch (whose content the M4 branch folds instead — the simplified post-merge workflow applied). Ratified decisions: Vite React SPA same-origin behind the Fastify API; `@auth/core` mounted on Fastify with database sessions (fallback pre-agreed and founder-gated); workspace tenancy with unclaimed-installation backfill and signed-state claiming; application-layer isolation with an RLS trigger recorded; `/api/v1` conventions including decay-at-read in SQL; proposals-as-query quarantine; best-effort live feed over Redis pub/sub → Socket.IO rooms; five ADRs (0012–0016); single-member workspaces (no invites) in M4.

**Implementation** (eight sequential components on `feat/web-dashboard`, each verified then committed): migration 0003 + ADR-0012 → the Auth.js risk spike (succeeded; fallback unused) + ADR-0013 → `@devflow/contract` + v1 read API + ADR-0014 → installation claiming + `installation` webhook job → quarantine + annotation labeling + ADR-0016 → live feed + ADR-0015 → `apps/web` → scripted e2e + this docs pass. 129 tests green; e2e 14/14 (claim → divergences → 0.3333 suspected → flaky 0.6 → approve quarantine → "1 quarantined" neutral check → workspace-scoped socket events → redelivery convergence).

Notable incidents, all now recorded as lessons: the e2e exposed a real SPA bug (JSON content-type on body-less POST → Fastify 400) that inject()-based tests cannot catch; a poll treating `rowCount: 0` as truthy waited for nothing and manufactured impossible-looking state; the M3 leaked-process incident recurred via orphaned `tsx` grandchildren and is now handled structurally (detached process groups + port preflight); exactly two fresh divergences score a hair below the flaky threshold — the under-flagging bias made visible.

**Recorded for the founder:** D11 squash decision still open (needed before this PR); GitHub App reconfiguration for login/claiming (github-app-setup.md §3b) and the real-GitHub verification pass; backfill decision still parked (M6 recommended); both stale closeout branches deletable unmerged.

## Session of 2026-07-19 (later) — Milestone 5 design review and implementation

**Design:** M4 had merged (PR #9 — fourth merge commit; the founder subsequently ruled D11 a repository-governance matter, explicitly not an implementation blocker). The full M5 architecture review was produced from repository state and **founder-approved** with one early-validation gate: measure the local embedding approach before building on it. Ratified decisions: the **self-hosting split** (local MiniLM embeddings for search/clustering — key-free; BYO-key Claude for hypotheses — cleanly absent without a key); `@devflow/ai` as the amputable package with enumerated call sites; content-addressed embeddings; exact-scan pgvector with an HNSW trigger; clustering as deterministic geometry; digest-cached human-triggered hypotheses with provenance; an **inverted cut line** (the LLM half would drop first — the roadmap's "summarization-only" cut assumed the opposite economics and was consciously superseded).

**The gate, measured (component 1):** ~25 MB model, ~0.4 s warm load, ~150 MB RSS, 2–6 ms per text on the WSL2 machine; paraphrases 0.79–0.82 cosine vs 0.22–0.23 unrelated. Passed decisively — the API-embeddings fallback stayed unused. Recorded bonus: `onnxruntime-node` runs under pnpm 10's lifecycle-script blocking (prebuilt binaries) — D13 intact.

**Implementation** (six components on `feat/ai-insights`, each verified then committed): `@devflow/ai` + ADR-0017/0018 → migration 0004 + worker embedding stage + CI model cache → search/clusters endpoints + `/me` features → LLM client + hypothesis endpoint + ADR-0019 → web Insights + hypothesis panel → e2e + docs. 158 tests; e2e **22/22** (the full M4 regression flow plus: real-MiniLM search ranking paraphrases 0.72/0.69 over unrelated 0.26, clusters 2+1, stub-LLM hypothesis with provenance and cache semantics, prompt-injection instruction asserted on the wire).

Notable and recorded: measuring beat arguing (the local-vs-API embeddings question died in one spike run); content-address-before-embedding turned inference cost into a rounding error; the e2e again proved its worth as the only layer that catches full-HTTP-path issues.

## Standing outcomes of this day

1. Product locked: CI reliability platform (flaky tests) for GitHub Actions.
2. Milestone 0 complete and review-approved; **initial commit awaiting founder confirmation**.
3. Milestone workflow, NEVER-list and review discipline in force ([implementation-rules.md](implementation-rules.md)).
4. Next: founder commits/pushes + manual GitHub setup, then Milestone 1 (GitHub App + webhook ingestion).
