# ADR-0017: The AI boundary, formalized

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** founder + lead engineer

## Context

"AI assists, never decides" has been a product principle since day one (D14, NEVER-list #4, project-overview.md). M5 is the first milestone that ships AI code, so the principle needs a mechanical form: which capabilities exist, where their code lives, where their outputs may land, and how a reviewer verifies the boundary holds — before any of it is written. Two invariants constrain everything: the **amputable-AI architecture** (architecture-context: deleting the layer leaves a fully functional product) and **self-hostability** (NEVER-list #11: no managed-only dependencies).

## Decision

**All AI code lives in `@devflow/ai`. Its call sites are enumerated below and are the only ones permitted. Its outputs land in exactly two places, both advisory. The LLM runs only when a human asks.**

- **Capability split along the self-hosting line:** semantic search and failure clustering run on a **local embedding model** (ADR-0018 — no key, no managed dependency, self-host-complete); root-cause hypotheses use a **BYO-key LLM** (ADR-0019 — absent key means the feature is cleanly off: API answers `501 ai_disabled`, UI never renders the button, driven by a `features` object on `/api/v1/me`).
- **Enumerated call sites (the amputation seam).** Worker: the embedding stage in the ingest pipeline. API: the search route, the failure-clusters route, the hypothesis routes, the `features` flags. Web: the Insights page and the hypothesis panel on test detail. **Nothing else may import `@devflow/ai`** — specifically not detection, quarantine, annotation, normalization, or the webhook path. The deletion test is part of this contract: remove the package and these seams, and `pnpm verify` must pass with the product fully functional.
- **Permitted output sinks, exhaustively:** (1) `failure_embeddings` rows — derived, rebuildable data used only by search/clustering reads; (2) `ai_hypotheses.content` — cached advisory text with provenance (model, prompt version, requester, timestamp), rendered to humans under a standing disclosure ("AI-generated hypothesis — verify before acting"). AI output never touches scores, verdicts, quarantine state, check runs, or any GitHub-facing surface; the PR annotation remains 100% deterministic (ADR-0011/0016 unchanged).
- **Human-trigger rule:** no background, scheduled, or pipeline-invoked LLM calls exist anywhere. A hypothesis is generated when a member clicks the button, cached by input digest, token-capped, and regenerated only on changed evidence or explicit human request. Embedding is the one background AI computation permitted — it produces geometry, not judgment, and its stage is failure-isolated (an embedding error can never fail or retry ingestion).
- **Untrusted-input posture:** failure logs are attacker-controlled text that flows into embeddings and prompts. The embedder is immune by construction (output is a vector). The LLM has no tools, no actions, and one text sink; prompts instruct the model to treat log content as data. The residual risk — a crafted log steering hypothesis _text_ that a human reads — is accepted and is precisely why the output is labeled advisory and never automated onward.

## Alternatives considered

- **AI features as a separate optional service/container** — rejected: heavier amputation story than a package boundary, another process to operate, and it would still need the same call-site discipline at its API edges.
- **Feature flags without a package boundary** (AI code inline in api/worker) — rejected: the deletion test becomes archaeology; a package with enumerated imports is grep-verifiable.
- **Letting hypotheses enrich check-run annotations** — rejected outright: the PR surface is the product's trust anchor and stays deterministic; a hallucinated sentence in a PR check is the exact failure mode D14 exists to prevent.
- **Background hypothesis pre-generation** (warm caches for every flaky test) — rejected: cost without a reader and a step toward AI output existing before a human asked for it.

## Consequences

- Reviewers verify the boundary mechanically: `grep -r "@devflow/ai" apps packages` must return only the enumerated seams; this check is cheap enough to run in every review.
- A deployment with no key and no model download is a fully functional CI-reliability product — the amputation proof doubles as the offline/self-host story.
- Future AI capabilities (M6+ or post-MVP) join by amending this ADR's enumeration via a superseding ADR, not by adding an import.
