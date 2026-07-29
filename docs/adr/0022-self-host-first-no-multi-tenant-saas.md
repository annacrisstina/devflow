# ADR-0022: Self-host-first; no multi-tenant SaaS

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** founder + lead engineer

## Context

DevFlow is an open-source, self-hostable CI reliability platform; v0.1.0 is tagged and the phase now starting is validation against real GitHub, not feature work. Two forces make this decision due now.

**First, the strategic direction exists only in chat.** The founder ruled that DevFlow stays self-host-first and will not become a public multi-tenant SaaS. Chat has already destroyed one design document — the M6 architecture review, lost mid-session to a Docker crash and rebuilt from repository state days later. Anything load-bearing lives in the repository or it does not exist.

**Second, several open questions are parked on a trigger this decision retires.** ADR-0012 defers row-level security "until any deployment hosting mutually-untrusting tenants." ADR-0021 accepts an unauthenticated `/metrics` and says "revisit if multi-tenant deployments materialize." NEVER-11 (implementation-rules) already forbids breaking `docker compose up` with managed-only dependencies — a standing prohibition with no decision record behind it. Together they leave a door open, and behind that door sits an entire program of work: billing, signup, per-tenant rate limiting and quotas, noisy-neighbor isolation, abuse controls, tenant-facing SLOs, rotation for an internet-facing App.

The cost of leaving this undecided is not a missing feature. It is that every future scope conversation reopens "but what if we hosted it?", and that speculative hardening for tenants who will never exist competes for time with validation that has demonstrated value.

One terminology note, because the words collide: DevFlow **is** multi-tenant _software_ — a single deployment holds many workspaces (ADR-0012). This ADR is about _operation_: whether this project runs a service for mutually-untrusting third parties.

## Decision

**DevFlow is self-host-first, and operating a public multi-tenant SaaS is out of scope for this roadmap. The unit of deployment is one organization running its own instance; the unit of trust is that deployment's operator. Reversing any part of this requires a superseding ADR; until one exists, this decision stands.**

What "self-host-first" _obligates_, so compliance is testable rather than aspirational:

- Every feature must work on a single node via `docker compose --profile full up` with no vendor-operated service in the path. NEVER-11 now has a decision record behind it.
- No feature may depend on a DevFlow-operated endpoint. Anything requiring payment is bring-your-own-key and cleanly absent without one (ADR-0019); the key-free path stays the default (ADR-0018).
- The compliance test is the **stranger test** — fresh clone, `docs/self-hosting.md` followed literally, throwaway credentials — run per release, as it was for v0.1.0 where it caught a real defect.

What is out of scope for this roadmap — not planned, not prepared for:

- Billing, plans, metering, per-seat pricing.
- Public signup, account provisioning, onboarding funnels.
- Per-tenant rate limiting, quotas, noisy-neighbor isolation, tenant-facing SLOs or status pages.
- Anti-abuse and anti-fraud surface for arbitrary installers.
- Row-level security **for this project's own operation**. ADR-0012's trigger is not deleted — it is _reassigned_: it belongs to a downstream self-hoster who chooses to host mutually-untrusting tenants, not to us. ADR-0021's `/metrics` revisit is reassigned the same way.

**A public demo instance, if one is ever deployed, accepts no GitHub App installations and holds no third-party data** — seeded synthetic data only (`pnpm demo:seed`). It is not planned for v0.1.x. Any other shape requires a superseding ADR.

This ADR forbids a business model, not a feature class. Explicitly untouched: the workspaces schema and its team-readiness (ADR-0012), additional CI providers or report formats, and every other feature question, each judged on its own merits.

## Alternatives considered

- **Leave it undecided.** Rejected: this is the status quo, and it is not free. Its costs are the recurring scope conversation and speculative hardening. An unmade decision defaults to "keep the option open" — the most expensive option available.
- **Build multi-tenant-ready now, host later.** Rejected: textbook NEVER-10 speculative scaffolding, for the most demanding user imaginable — one who does not exist. RLS, quotas and abuse controls are weeks of work justified by a threat model with no members.
- **Record this in project memory (as D15) instead of an ADR.** Rejected: project memory is editable narrative; ADRs are immutable and superseded rather than rewritten (ADR-0001). A decision whose entire value is that it _stays decided_ belongs in the immutable record. It also passes ADR-0001's own significance test — it removes a class of non-functional requirements that no maintainer could restore in an afternoon.
- **Operate a public multi-tenant SaaS.** Rejected on the merits for a solo maintainer: it converts an OSS product into an operations business — uptime promises, an internet-facing App accepting arbitrary installs, custody of other people's CI data, key rotation, incident response — none of which improve the software. It also contradicts the product's own positioning: the audience DevFlow targets is people who do not want to send CI data to a third party (project-overview.md, P2). Becoming that third party is a strategy at war with its own pitch.

## Consequences

- Positive: a large class of work closes for this roadmap, and the closing _is_ the deliverable — the deletion this enables is worth more than any feature it forbids.
- Positive: two parked decisions (ADR-0012 RLS, ADR-0021 `/metrics`) get an owner and leave the backlog as open questions.
- Positive: the trust model the documentation already assumes — single operator, single organization — becomes stated rather than implied.
- Negative: a hosted offering later requires a superseding ADR and real work. That friction is the intended mechanism, not an oversight.
- Negative: "no SaaS" is not a license for sloppy isolation. Self-hosters are real users; a workspace-isolation bug inside one deployment is still a bug, and ADR-0012's per-endpoint cross-tenant denial tests remain mandatory.
- Neutral: reachable deployments used for validation — webhook tunnels, dogfood installs on the founder's own repositories — are unaffected. They are single-operator instances, not a service.
