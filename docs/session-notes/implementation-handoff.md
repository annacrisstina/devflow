# Implementation Handoff

> **The operational handoff.** Always reflects the latest repository state; updated at the end of EVERY working session. A new engineer (human or AI) should be able to continue from this file alone, without any chat history. Background knowledge lives in [../project-memory/](../project-memory/); read [project-overview.md](../project-memory/project-overview.md) and [implementation-rules.md](../project-memory/implementation-rules.md) first.

**Last updated:** 2026-07-14 (end of session)

## Current repository status

- **Branch:** `main` (the only branch; repo is local-only, **not yet pushed to GitHub**).
- **Git state:** ⚠️ **NO COMMITS YET.** All ~50 files are staged and verified; the initial commit is prepared and awaiting the founder's explicit confirmation (per milestone workflow rule 6). Suggested, commitlint-validated message:
  ```
  chore(repo): scaffold monorepo foundation and engineering standards
  ```
- **Working directory:** `/mnt/d/PROIECTE + CURSURI/project/devflow` (WSL2, Windows-mounted drive — see Environment notes).
- **Local infra:** `devflow-postgres` (pgvector/pg17) and `devflow-redis` running and healthy via `docker compose up -d`; pgvector 0.8.5 verified working.

## Completed

- **Milestone 0 — repository foundation: DONE and APPROVED** by a formal Repository Readiness Review (adversarial, from-scratch re-verification; confidence 92%). Full detail: [development-log.md](../development-log.md) entry M0.
- All 5 review blockers remediated and individually re-verified (SHA-pinned actions, Dependabot, issue forms, owner placeholders → `annacrisstina`, CoC; plus loopback ports, committed `.vscode`, `.gitattributes`, `.npmrc engine-strict`, compose validation in CI).

## Current priorities (in order)

1. **Founder actions (blockers for M1, cannot be done by the engineer):**
   - Run the initial commit (message above; everything is staged).
   - Create the GitHub repo `annacrisstina/devflow` and push.
   - GitHub settings: branch protection on `main` (require PR; require `quality` + `commitlint` checks; linear history), enable Discussions (issue-form config links to it), repo topics + description.
   - Confirm the first CI run on GitHub is green (the withheld 8% of review confidence).
   - Locally, once: `sudo corepack enable` (until then use `corepack pnpm ...`).
2. **Then: Milestone 1.**

## Next milestone: M1 — GitHub App + webhook ingestion skeleton

Scope (full rationale in [roadmap.md](../project-memory/roadmap.md)):

- `apps/api` — Fastify app, TypeScript strict, first real workspace package (this activates the currently-vacuous typecheck/build/test CI gates — a documented M0 debt).
- `packages/db` — Drizzle schema + first migration (raw webhook events table).
- `POST /webhooks/github`: HMAC `X-Hub-Signature-256` verification (constant-time), persist raw payload append-only, fast ACK, delivery-GUID idempotency.
- GitHub App registration (founder creates the app; manifest + setup documented in `docs/`).
- Local webhook dev loop (smee.io or equivalent tunnel).
- ADRs due: Fastify choice; ingestion model (raw-first + idempotency); GitHub App vs OAuth App.

**Exact starting point for the next session:** confirm founder actions above are done → propose M1 design decisions (step 1–2 of the milestone workflow: goal + design, BEFORE files) → wait for approval → implement.

## First implementation task of M1 (after design approval)

Scaffold `apps/api` + `packages/db` as workspace packages wired into Turborepo (build/typecheck/test tasks), with one failing-then-passing test to prove the CI gates actually gate now.

## Remaining blockers

- Founder actions listed above (commit, push, GitHub settings). Nothing else blocks M1.

## Repository health

- `pnpm format:check` ✅ · `pnpm lint` ✅ · `docker compose config -q` ✅ · containers healthy ✅ · commitlint on suggested message ✅.
- `pnpm verify`'s typecheck/build/test legs are **vacuous** until M1's first package (known, disclosed in README footnote).
- `./scripts/doctor.sh` fails locally only on "pnpm not in PATH" — environment issue (`sudo corepack enable` pending), not a repo issue.

## Known technical debt (accepted, tracked)

1. **E1:** vacuous typecheck/build/test gates → closes naturally in M1.
2. **C2:** commitlint CI job installs the whole workspace (~1m40s cold) just to lint messages → isolate when it hurts.
3. `docs/architecture/` is an intentional placeholder → must be populated by M1–M2 (diagrams describe real code only).

## Environment notes (this machine)

- WSL2; repo on `/mnt/d` (drvfs) → filesystem ops ~10–30× slower than ext4 (install took 1m42s). Standing recommendation: move repo to `~/dev/devflow`, access from Windows via `\\wsl$`. Founder has not decided yet.
- Node 20.19.4 local (out of LTS since April 2026); `.nvmrc` targets 22 → `nvm install 22` recommended. `engines` floor is `>=20.19.0` so local still works.
- pnpm only via `corepack pnpm ...` until `sudo corepack enable` is run.
- GitHub username: `annacrisstina` (verified to exist). Contact email in SECURITY/CoC: rohike.contact@gmail.com.

## Things to remember before continuing

- Follow the **milestone workflow** and the **NEVER list** in [implementation-rules.md](../project-memory/implementation-rules.md) — especially: design before files, run verifications for real, wait for confirmation at milestone boundaries, never reopen the choice-of-project question without a technical blocker.
- Update this file at the end of every session; append to [development-log.md](../development-log.md) after every milestone; update project-memory docs when significant decisions are made.
- The founder communicates in Romanian; the repository is entirely in English.
