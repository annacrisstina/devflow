# End-to-end harness

`pnpm e2e` runs the whole product against real API + worker + Postgres +
Redis processes, with the GitHub API and the LLM API stubbed locally (the
real HTTP clients talk to the stubs — nothing is mocked in-process). It
covers: installation claiming → detection arithmetic (pinned to ADR-0010) →
advisory annotation → quarantine labeling → embeddings with the **real**
local model → semantic search → clustering → hypothesis caching → the live
socket feed → redelivery convergence.

**Requirements:** dev infrastructure running (`docker compose up -d`), ports
3196–3199 free, `~/.local/bin` on PATH (pnpm). **Side effects** (cleaned up
on success): a throwaway `devflow_e2e` database and Redis logical db 5.

This is a local verification tool, not a CI job (CI runs the 158-test suite;
this needs Docker and spawns real servers — the same honesty footnote as the
integration tests). If a run crashes, kill leftovers before retrying: the
harness preflights its ports and refuses to run against stale listeners.
