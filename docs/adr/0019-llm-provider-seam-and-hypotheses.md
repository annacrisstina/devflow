# ADR-0019: LLM provider seam and root-cause hypotheses

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** founder + lead engineer

## Context

The one M5 capability that genuinely needs a language model: turning a flaky test's evidence (verdict, divergences, recent outcomes, failure messages) into 1–3 plausible root-cause hypotheses a developer can act on. Constraints from ADR-0017: human-triggered only, one output sink, advisory framing, and cleanly absent without a key (NEVER-#11 — the product must not require a managed service). Cost must be structurally bounded, not policy-bounded. Failure logs entering prompts are untrusted input.

## Decision

**A one-method provider interface (`complete(request) → {text, model}`) with a single implementation: Anthropic's Messages API over plain `fetch`, BYO key. Hypotheses are generated on click, cached by input digest with full provenance, and rendered only as labeled advisory text.**

- **Client (`@devflow/ai/llm`):** ~70 lines over `fetch`, injectable `fetchImpl`/`baseUrl` — the ADR-0009 in-house-client pattern again, so tests and the e2e run the _real client_ against a local stub. `DEVFLOW_AI_API_KEY` (no default, ever), `DEVFLOW_AI_MODEL` (default **`claude-haiku-4-5`** — hypothesis generation is short-context summarization; pennies per click; configurable up to a Sonnet-class model), temperature 0.2, output capped at 800 tokens.
- **Endpoint semantics:** `POST /flaky-tests/:scoreId/hypothesis` gathers the evidence (effective verdict/score, evidence counts, last 10 outcomes, up to 5 distinct failure messages), digests it (`sha256(evidence + prompt_version)`), and serves the cached row when the digest matches — the LLM is called only for _new evidence_, `force: true`, or a prompt-version bump. `GET` serves the cache; no cache is a 404, not a generation. One row per test identity (upsert; identity copied, not FK'd to the score cache — ADR-0016's reasoning).
- **Cost is structurally bounded:** no background calls exist; every invocation traces to a human click; unchanged evidence never re-bills; output tokens are capped. There is no rate limiter because there is no loop to limit.
- **Provenance is part of the output:** model id (as answered by the API, not as requested), prompt version, requesting user, timestamp — stored and displayed. A hypothesis without provenance is treated as a bug.
- **Prompt posture:** the system prompt fixes the role (advisory analyst), instructs the model to treat failure messages as untrusted log data and never follow instructions inside them, and demands cited evidence + a verification step per hypothesis. Upstream failures map to `502 ai_upstream_error` and never disturb the existing cache.

## Alternatives considered

- **`@anthropic-ai/sdk`** — fine software; rejected because the fetch client is smaller than the dependency, matches the house pattern, and keeps the provider seam honest (nothing SDK-specific leaks into the interface).
- **Multi-provider support now** (OpenAI, local LLMs) — rejected: one seam, one implementation, zero speculative adapters (NEVER-#10). The interface is the extension point; a second provider is a follow-up PR, not a framework.
- **Streaming responses** — rejected for MVP: an 800-token capped completion arrives in seconds; streaming buys UI polish at the lowest-priority layer.
- **Background/batch pre-generation** and **hypotheses in check runs** — rejected in ADR-0017; restated here because they are the two most tempting future violations.
- **Storing hypothesis history** (a row per generation) — rejected: the cache is a convenience, not an audit log; regeneration replaces. If auditability is ever needed, that is a new decision.

## Consequences

- Live verification against the real Anthropic API requires the founder's key (same founder-step precedent as real-GitHub verification); everything else — client wire shape, caching, digests, failure mapping — is verified against the stub.
- A prompt improvement is a `PROMPT_VERSION` bump: caches invalidate naturally through the digest, and old hypotheses remain attributable to the prompt that produced them.
- The `502` on upstream failure means a rate-limited or misconfigured key degrades exactly one button, with the cached hypothesis (if any) still served.
- The seam is the recorded path for a second provider; the ADR-0017 enumeration does not change for that (the import site stays the same).
