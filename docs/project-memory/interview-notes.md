# Interview Notes

> Part of the [project memory](../README.md#project-memory). For every major decision: why it matters, what it demonstrates, which interview questions it unlocks, and how to narrate it. This file is founder-facing preparation material — it is honest about the project being portfolio-driven, because that honesty is itself defensible ("I chose a project that would force me to learn production patterns").

## How to use this file

Before an interview, pick the 3–4 stories most relevant to the company (integration-heavy → GitHub App + webhooks; infra-heavy → queues + idempotency; product-minded → AI boundary + quarantine UX). Each story below follows: context → decision → trade-off → outcome. Never recite; reconstruct.

---

## 1. The webhook ingestion path (M1) — the crown jewel

- **Why it matters:** webhook ingestion at scale is a canonical System Design interview question (Stripe literally runs on this pattern), and DevFlow's version is real, not whiteboard.
- **Concepts demonstrated:** hostile-input validation (HMAC, constant-time compare), ACK-fast pattern (persist raw → enqueue → 2xx before heavy work), at-least-once delivery, idempotent consumers (delivery GUID as key), out-of-order tolerance, burst absorption.
- **Unlocks:** "Design a webhook processing system", "How do you guarantee exactly-once processing?" (answer: you don't — at-least-once + idempotency, and I can show where mine dedupes), "How do you handle a producer that retries?"
- **How to tell it:** start from the failure mode — "GitHub retries deliveries and delivers out of order; my first design assumed ordering and it was wrong on paper before it was wrong in code. Here's what I changed."

## 2. GitHub App vs OAuth App (M1)

- **Why it matters:** most students use a PAT or an OAuth app; knowing why a GitHub App is the correct integration primitive signals real integration experience.
- **Concepts:** app-level JWT → short-lived installation tokens, granular permissions, per-installation rate limits (~5k/h each vs one shared pool), webhook subscription as part of the app model.
- **Unlocks:** OAuth flows generally, token lifecycle management, rate-limit-aware client design (backoff + jitter, reading rate-limit headers).
- **How to tell it:** "I needed to act on repos I don't own, with the least privilege the platform allows, without burning one shared rate limit — that's exactly what GitHub Apps are for."
- **Detail worth telling (M2, true war story):** the JWT was hand-rolled on `node:crypto` (ADR-0009) and that's how we learned GitHub issues **PKCS#1** private keys ("BEGIN RSA PRIVATE KEY") that pure-JS JWT libraries refuse to import — plus iat backdating for clock drift and a promise-valued token cache so concurrent jobs share one in-flight exchange. Small, verifiable, proves the dance was actually implemented, not delegated to Octokit.

## 3. Queue + workers (M2)

- **Why it matters:** first-hand answers about background processing, the most common junior-plus systems topic.
- **Concepts:** decoupling receipt from processing, retries with exponential backoff, dead-letter queues, bounded concurrency, backpressure, job idempotency (a retried parse must not double-insert results).
- **Unlocks:** "Design a job scheduler", "What happens when a worker dies mid-job?", "Kafka vs Redis queues — when is each right?" (my ADR documents why BullMQ over Kafka at this scale: operational weight vs actual throughput needs — knowing when NOT to use Kafka is stronger signal than using it).

## 4. Flakiness detection engine (M3)

- **Why it matters:** the only part with novel algorithmic content — separates the project from CRUD-with-integrations.
- **Concepts:** statistical inference from noisy signals, strong vs probabilistic evidence (same-commit divergence vs transition history), temporal decay, false-positive cost asymmetry (wrongly flagging a real regression as flaky is the worst failure — it hides bugs).
- **Unlocks:** precision/recall trade-off discussions, threshold tuning, "how would you validate the detector?" (backtesting against labeled history from real OSS repos).
- **How to tell it:** lead with the asymmetry — "a false 'flaky' verdict teaches the team to ignore a real bug, so the system is tuned conservative and a human approves every quarantine."

## 5. AI assists, never decides (M5 + product principle)

- **Why it matters:** in a market flooded with AI-wrapper portfolios, deliberate AI restraint is the differentiator.
- **Concepts:** human-in-the-loop design, blast-radius analysis of model errors, amputable-AI architecture (delete the layer, product still works — provable in the code).
- **Unlocks:** "Where would you use an LLM in this system?" — and the stronger inverse, "where did you refuse to, and why."
- **How to tell it:** "clustering 40 failure logs into one hypothesis is cheap if wrong; quarantining a healthy test is expensive if wrong. AI got the first job and was banned from the second."

## 6. Monorepo + tooling discipline (M0)

- **Why it matters:** first impression of the repo; shows the candidate has felt (or anticipated) real coordination pain.
- **Concepts:** phantom dependencies and pnpm strictness, task graphs and caching (Turborepo), dependency-direction rules, ADR practice, honest quality gates.
- **Unlocks:** "How do you structure a codebase for a team?", "monorepo vs polyrepo?", "How do you keep CI fast as a repo grows?"
- **Detail worth telling:** ADR-0002 lists what we _rejected_ (Nx, polyrepo) with reasons — interviewers probe rejected alternatives more than chosen ones.

## 7. Supply-chain security posture (M0 review remediation)

- **Why it matters:** most portfolios ignore supply chain entirely; concrete, current, and the story includes a real gotcha.
- **Concepts:** mutable-tag risk (tj-actions/changed-files incident, March 2025), SHA pinning, Dependabot strategy (grouped minor/patch, individual majors — each breaking change gets its own revert point), pnpm 10 lifecycle-script blocking.
- **The gotcha story:** "when I pinned `pnpm/action-setup@v4.0.0` I discovered the tag was _annotated_ — the ref API returns a tag object SHA, not the commit. Pinning the wrong one breaks CI. I dereferenced via the commits API and verified every pin." Small, true, memorable, and exactly the kind of detail that proves the work was actually done.

## 8. The readiness-review process itself (M0)

- **Why it matters:** demonstrates engineering _process_ maturity, not just code: adversarial self-review with BLOCKER/MAJOR/MINOR severities, findings re-verified from scratch, milestone blocked until blockers cleared.
- **Unlocks:** "Tell me about a time you reviewed code" / "How do you ensure quality without a team?" — rare authentic answers for a solo student project.
- **How to tell it:** "my own review found five blockers in my own milestone — including a vacuous CI gate I'd shipped. I documented it in the README footnote instead of hiding it, because a green badge that guards nothing is a lie."

## 9. Choosing the project (meta-story — use with care)

- **Why it matters:** demonstrates decision-making under trade-offs, the most senior signal available to a student.
- **The narrative:** three candidate projects were scored across 16 hiring-relevant axes; an incident-response platform won on paper and was rejected on **authenticity** ("I've never been on-call — I can't defend that domain under questioning; I _live_ flaky CI daily"). Product judgment = knowing what you can credibly build and defend.
- **Care note:** only tell this when asked "why this project?" — volunteering it unprompted sounds like process theater.

## Gap-coverage map (which CV gap each milestone closes)

| CV gap                                     | Closed by                                           |
| ------------------------------------------ | --------------------------------------------------- |
| OAuth / modern auth                        | M1 (GitHub App JWT/tokens), M4 (Auth.js login)      |
| Third-party integrations, GitHub APIs      | M1–M3 (webhooks, REST/GraphQL, Checks API)          |
| Webhooks                                   | M1                                                  |
| Event-driven architecture, queues, workers | M2                                                  |
| Distributed-systems thinking               | M1–M2 (idempotency, ordering, retries)              |
| Observability                              | M2+ (structured logs, correlation IDs, metrics), M6 |
| Production engineering                     | M6 (self-hosting, hardening, release)               |
| CI/CD                                      | M0 (pipeline) + the product's entire domain         |
| System Design interview prep               | every ADR                                           |
| AI as engineering tool                     | M5 + the boundary principle                         |
