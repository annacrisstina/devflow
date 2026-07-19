# ADR-0016: Quarantine workflow — proposals as queries, decisions as records

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** founder + lead engineer

## Context

Quarantine is the product's escalation path beyond advisory annotation (ADR-0011): a maintainer declares a test known-flaky so its failures stop consuming attention. The product invariant (D14, NEVER-list #4) is that no automated system ever decides quarantine — the system proposes, a human approves. MVP scope per the roadmap: propose → human-approve → track; the pre-planned cut line degrades this to flagging-only. Constraints: `test_flake_scores` is a rebuildable cache (ADR-0010) that decays at read time (ADR-0014), so quarantine state must not depend on it structurally; the annotation stage must be able to surface quarantine in check runs without weakening the advisory guarantee.

## Decision

**Proposals are a query. Decisions are rows. Only humans write the rows.**

- **A proposal is any test identity whose _effective_ (decayed) verdict is `flaky` with no active or dismissed quarantine record.** Nothing writes "proposed" state anywhere — the proposal list is a view over detection output, so it is always current, cannot drift, and cannot be gamed by background jobs. This is D14 made structural: grep for writers of `quarantine_records` and you find only the human-triggered endpoints.
- **`quarantine_records` stores decisions, append-in-spirit:** approve → `active` row; dismiss a proposal → `dismissed` row; lift → the active row becomes `lifted` (lifter + timestamp recorded). Every row keeps who/when/why. A **partial unique index** (`WHERE status = 'active'`) allows at most one active record per identity while keeping full decision history queryable.
- **Identity is copied** (repository + suite/class/test), **never a foreign key into `test_flake_scores`**: a durable human decision must survive the cache being rebuilt, decayed, or deleted.
- **Semantics of each state:** `active` — failures are labeled "quarantined, safe to ignore" in check runs and the dashboard; `dismissed` — suppresses re-proposal (the maintainer said "this one is just broken"), reversible by approving from the dismissed list; `lifted` — history only, the identity may be re-proposed if evidence returns.
- **Annotation integration:** the annotation stage flags a failing test if it holds a non-healthy verdict OR an active quarantine — quarantine being the stronger, human-made statement, it labels the failure even when the score has decayed (and renders with a dash when no score row exists). The check's conclusion remains hardcoded `neutral`; quarantine changes _content only_. ADR-0011's advisory-by-construction guarantee is untouched.
- **Authorization:** any workspace member can decide (owner/member alike) — a deliberate M4 simplification, recorded; role-gated approval arrives with real multi-member workspaces.

## Alternatives considered

- **Materialized proposal rows written by the detection stage** — rejected: background state mutation that drifts from the live score, needs cleanup when scores decay, and moves the system one step toward writing quarantine state on its own.
- **Quarantine as a column on `test_flake_scores`** — rejected: ties a durable decision to a rebuildable cache; a recompute or rebuild would have to carefully preserve human state inside derived data.
- **Auto-lift when the effective score decays to healthy** — rejected: humans lift; the dashboard shows the decay and can suggest. An automatic lift is an automated quarantine decision by another name.
- **One mutable row per identity (status flips in place)** — rejected: destroys the decision history ("who dismissed this, when, why?") that makes quarantine auditable; the partial unique index gives one-active-at-a-time without sacrificing history.
- **Skipping/excluding quarantined tests from CI runs** (real quarantine à la test-runner integration) — out of MVP entirely: it requires touching the user's workflow files or test runner. DevFlow annotates; it does not modify CI. Recorded as the obvious post-MVP extension.

## Consequences

- Dismissing is per-identity and permanent-until-reversed; a dismissed test whose evidence keeps growing does NOT resurface on its own — visible under the dismissed tab instead. Chosen over cleverness (re-propose thresholds) to keep the mental model simple; revisit with real usage data.
- The proposals query joins scores → repos → installations with a NOT EXISTS — same shape and scale as the ranking query (ADR-0014's measure-first escape hatch applies).
- Concurrent double-approval races on the partial unique index; the loser surfaces as 409. Dismiss has no unique constraint (duplicate dismissed rows are harmless history noise) — accepted.
- The M4 web UI ships three tabs (Proposed / Active / Dismissed) directly off these queries; lifting lives on the Active tab.
