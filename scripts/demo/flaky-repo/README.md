# devflow-demo-flaky — template

A deliberately flaky test suite for demoing DevFlow against **real** GitHub Actions runs. This directory is a template, not a workspace package: copy it into its own repository (suggested name: `devflow-demo-flaky`).

## Setup

1. Create a new public GitHub repository and copy this directory's contents into its root (`.github/` included).
2. Install your DevFlow GitHub App on that repository (see `docs/github-app-setup.md` in the DevFlow repo), with a DevFlow deployment reachable by webhooks.
3. Push. Every run executes the suite and uploads `test-results/junit.xml` as an artifact — including failing runs (`if: always()`), which is what detection feeds on.

## Generating evidence fast

- **Re-run failed jobs from the Actions UI.** Same-commit re-runs with different outcomes are the strongest flakiness signal DevFlow knows (weight 1.0 vs 0.25 — ADR-0010); a couple of re-runs usually promote `retries the payment gateway on timeout` to _suspected_, then _flaky_.
- Tune the failure probability with the `FLAKE_RATE` env var (default 0.35) in the workflow if evidence accumulates too slowly or too fast.
- The second flaky test fails rarer and with a different message, so the Insights page has two failure clusters to show.
