# ADR-0009: In-house GitHub App client instead of Octokit

- **Status:** Accepted
- **Date:** 2026-07-18
- **Deciders:** founder + lead engineer

## Context

M2's worker must authenticate as a GitHub App (JWT → installation token) and call three REST endpoints: token exchange, artifact listing, artifact download. The obvious tool is Octokit (`@octokit/auth-app` + `@octokit/rest`), which does all of this. The project counter-force: the GitHub App auth dance is _named interview material_ (D6: "that complexity is the point"), and every dependency must be defensible line by line.

## Decision

We will use a **minimal in-house client** (~250 lines inside `apps/worker/src/github/`):

- App JWT hand-rolled on `node:crypto` — notably, `createPrivateKey` accepts the **PKCS#1** PEM GitHub actually issues ("BEGIN RSA PRIVATE KEY"), which several pure-JS JWT libraries (jose's `importPKCS8`) refuse. `iat` backdated 60s for clock drift; `exp` inside GitHub's 10-minute ceiling.
- Installation tokens cached per installation as **promises** (concurrent jobs share one in-flight exchange), refreshed 5 minutes before expiry.
- Errors classified at the boundary: 404/410 → `PermanentJobError` (never retried); everything else (401 drift, 403/429 rate limits, 5xx) → transient, so the queue's exponential backoff is the retry mechanism. Deliberately **no proactive rate-limit header tracking** in M2 (founder-directed minimalism); the wrapper is the single place to add it when real traffic warrants.
- `baseUrl` and `fetchImpl` injectable — unit tests run against undici's MockAgent with recorded response shapes; the local e2e runs against a stub server. No live GitHub in any test.
- Client lives **inside the worker** (the only GitHub API consumer; M3's backfill and Checks write-back also run here). It graduates to `packages/` only when a second app needs it — the conventions' own extraction rule.

## Alternatives considered

- **Octokit** — battle-tested, handles pagination/retries/rate limits. Rejected because it deletes the exact engineering story this milestone exists to earn, for a surface of three endpoints; and its plugin architecture is a heavyweight dependency tree for a worker that needs `fetch` and a signature. It remains the documented fallback: swapping the client for Octokit is an afternoon's contained change (ADR-0001 reversibility test passes).
- **jose for the JWT** — fails on GitHub's PKCS#1 keys without a conversion step; `node:crypto` needs no dependency at all.
- **Probot** — a full app framework; we need a signing function and three calls.

## Consequences

- The token dance, cache and classification are ours to test and to explain — recorded-response tests cover them; the founder can whiteboard every line.
- We own future GitHub API quirks (pagination beyond the bounded loop, secondary rate limits). Accepted: the wrapper is one file, and the Octokit escape hatch is real.
- Rate-limit handling is reactive-only until a milestone demonstrates the need; this is recorded here so nobody mistakes it for an oversight.
