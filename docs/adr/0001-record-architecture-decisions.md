# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-07-14
- **Deciders:** project owner

## Context

DevFlow will be built over several months by a very small team, with decisions accumulating faster than anyone's memory. Six months from now — or in an interview, or when an external contributor arrives — the question "why is it built this way?" must have a better answer than archaeology through commit history. Decisions that are cheap to make and expensive to reverse (tooling, data stores, integration boundaries, security posture) need their context preserved at the moment they are made, including the alternatives that were rejected and why.

## Decision

We record every architecturally significant decision as an Architecture Decision Record, following Michael Nygard's lightweight format (Status / Context / Decision / Consequences), stored in `docs/adr/` and numbered sequentially.

A decision is "architecturally significant" when it affects structure, non-functional characteristics, dependencies, interfaces or construction techniques — as a rule of thumb: anything a future maintainer could not safely reverse in an afternoon.

Rules:

- ADRs are immutable once accepted. A change of direction produces a **new** ADR that supersedes the old one; the old one's status becomes `Superseded by ADR-XXXX`.
- An ADR lands in the same PR as the change it justifies.
- The template lives at [template.md](template.md).

## Consequences

- Positive: decision context survives; onboarding and code review get a shared reference; rejected alternatives don't get re-litigated every quarter.
- Positive: forces decisions to be articulated before they are implemented, which catches weak reasoning early.
- Negative: small ongoing writing overhead per significant decision. Accepted — the overhead is minutes, the archaeology it replaces is hours.
