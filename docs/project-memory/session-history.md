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

## Standing outcomes of this day

1. Product locked: CI reliability platform (flaky tests) for GitHub Actions.
2. Milestone 0 complete and review-approved; **initial commit awaiting founder confirmation**.
3. Milestone workflow, NEVER-list and review discipline in force ([implementation-rules.md](implementation-rules.md)).
4. Next: founder commits/pushes + manual GitHub setup, then Milestone 1 (GitHub App + webhook ingestion).
