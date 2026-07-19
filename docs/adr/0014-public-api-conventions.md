# ADR-0014: Public API conventions and the derived-score read model

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** founder + lead engineer

## Context

M4 ships the first public API endpoints, which is exactly when architecture-context said versioning, error-shape and pagination conventions get decided — not before. One additional read-model problem lands with them: `test_flake_scores` is computed event-side (ADR-0010) and goes stale between runs — M3 recorded "stale non-healthy scores persist until the identity reappears; the M4 dashboard applies decay-at-read" as accepted debt. The consumer is our own SPA via the shared type-only `@devflow/contract` package (apps must not import apps).

## Decision

- **URL versioning:** everything under `/api/v1/`. Boring, visible, curl-able; a v2 is a new prefix, not a header negotiation.
- **Error shape:** `{ "error": { "code": "...", "message": "..." } }` — `code` is stable machine-readable API surface, `message` is free to change. Input validation stays JSON-Schema-at-the-boundary (ADR-0004); invalid input never reaches business logic.
- **Auth semantics:** 401 unauthenticated; **404 for non-membership and for foreign/malformed resource ids** — workspace and resource ids must not become an existence oracle (ADR-0012).
- **Pagination:** `limit` (default 25, max 100) / `offset` on unbounded lists (flaky-tests, runs), with `total` included; bounded lists (a workspace's repositories) return plain arrays. Cursor pagination is deferred until a list demonstrably outgrows offsets — the runs list is the expected first candidate; recorded, not built.
- **Wire types:** database bigints travel as strings, timestamps as ISO-8601 strings — declared once in `@devflow/contract`.
- **Decay-at-read:** a stored score `s` is unwound to its evidence `e = K·s/(1−s)`, decayed by the same half-life the engine uses (`e′ = e·2^(−Δdays/H)`), and re-saturated (`s′ = e′/(e′+K)`); verdicts derive from `s′` with the same thresholds. Same `DEVFLOW_FLAKE_*` env knobs as the worker — tuning detection tunes reads. **The expression is evaluated in SQL** so ranking order, verdict filters and pagination are consistent on the decayed value; the TS reference implementation is unit-pinned to worked reference numbers, and an integration test asserts SQL ≡ TS (drift fails the build). Symmetric structural property to ADR-0010's "always-failing scores zero": **a stale flaky verdict quietly degrades to healthy instead of shouting forever.**

## Alternatives considered

- **Header/content-negotiation versioning** — rejected: cleverness without a consumer who needs it; harder to demo with curl.
- **Verdict filtering on the stored verdict** (simpler SQL) — rejected: a filter that returns rows whose displayed verdict differs from the filter is a documentation lie in API form.
- **Computing decay in TypeScript after fetching a page** — rejected: ordering and pagination would run on the wrong (undecayed) value; page N could contain items that belong above page 1.
- **A background job re-computing stale scores on a schedule** — rejected: a write path (with scheduling, locking and failure modes) to solve what a pure read expression solves; the stored score stays an honest event-time value with provenance.
- **RFC 7807 `application/problem+json`** — rejected for MVP: our two-field error object carries the same information without the media-type ceremony; revisit if third-party API consumers materialize.
- **Codegen (OpenAPI → types)** — rejected: a generator pipeline to maintain versus one hand-kept types-only package for an API with a single first-party consumer.

## Consequences

- `@devflow/contract` is the single wire-shape truth for web and api; changing a DTO is a compile error on both sides.
- The API process now reads the `DEVFLOW_FLAKE_*` knobs too (boot-validated identically to the worker, including suspect < flaky); a deployment overriding them must restart both processes to stay coherent.
- `total` costs one extra count query per list request — accepted at MVP scale; the count and page run concurrently.
- Effective scores are cheap arithmetic per row, but the expression appears in ORDER BY/WHERE — if `test_flake_scores` ever grows past the point where scanning a workspace's scores hurts, a computed/cached column is the escape hatch (measure first).
