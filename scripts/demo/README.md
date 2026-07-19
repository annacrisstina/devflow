# Demo tooling

- **`pnpm demo:seed`** (`seed.mjs`) — replays a curated synthetic history through the real pipeline into your **local** dev database: a flaky test with same-commit divergences (~0.53), a suspected one (~0.46), an always-failing test that correctly scores zero, four distinct failure texts for search/clusters, and a quarantine proposal left for you to approve. Idempotent (deterministic delivery GUIDs); refuses non-local databases. Requires dev infra (`docker compose up -d`) and `pnpm install`; ports 3191–3193.
- **`flaky-repo/`** — a template repository with deliberately flaky tests, for demoing against real GitHub Actions runs. See its [README](flaky-repo/README.md).

## Demo video storyboard (v0.1.0)

Recording is a founder step; this is the script. Prep: fresh stack (`docker compose --profile full up -d`), `pnpm demo:seed`, logged-in workspace with the demo installation attached, plus the live `devflow-demo-flaky` repo with a few re-run rounds of history.

1. **The problem (~20 s).** A red PR check on the flaky demo repo; re-run; it goes green. "Nothing changed. That test just lies sometimes — and every re-run teaches your team to ignore CI."
2. **The dashboard (~40 s).** Flaky-tests view from the seeded workspace: ranked scores, then the detail page — the evidence table in plain language (same-commit divergences vs branch transitions, decay). Point out `Legacy.always_red` is NOT flagged: "always failing is broken, not flaky — DevFlow won't cry wolf."
3. **The PR annotation (~30 s).** The neutral check run on a PR: names the known-flaky failure, links evidence. "Advisory by design — it can never block your merge."
4. **Quarantine (~30 s).** Approve the seeded proposal in the dashboard; trigger a failing run; the next check labels the failure quarantined. "DevFlow proposes. A human decides. Always."
5. **Insights (~30 s).** Semantic search for "gateway timed out" — paraphrases rank above unrelated failures; failure clusters; (optional, with a key) generate a root-cause hypothesis and show the provenance + verify-before-acting disclosure.
6. **Live feed + self-host close (~20 s).** Push to the demo repo, watch the run appear live. Cut to the terminal: `docker compose --profile full up -d` → `docker compose ps` all healthy. "Open source, one command, your infrastructure."

Total ≈ 2:50. Every beat runs on the seeded/live data above — no mocked screens.
