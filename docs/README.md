# DevFlow documentation

- [adr/](adr/) — Architecture Decision Records, the "why" behind structural choices. Start with [ADR-0001](adr/0001-record-architecture-decisions.md).
- [conventions.md](conventions.md) — naming, coding standards, commit convention, branch strategy, dev environment.
- [architecture/](architecture/) — system architecture documentation (diagrams, data flow). Populated from the first functional milestone onward.

## Project memory

The permanent memory of the project — the source of truth when chat history or human memory is unavailable. Three layers with distinct responsibilities and update contracts:

1. **[project-memory/](project-memory/)** — the engineering knowledge base: goals, decisions, rejected alternatives, philosophies, rules. **Updated whenever an important engineering decision is made.**
   - [project-overview.md](project-memory/project-overview.md) — vision, problem, users, goals, MVP, why this project won.
   - [engineering-decisions.md](project-memory/engineering-decisions.md) — every decision with alternatives and trade-offs; ADR summaries.
   - [architecture-context.md](project-memory/architecture-context.md) — system boundaries, philosophies, engineering principles.
   - [implementation-rules.md](project-memory/implementation-rules.md) — the working agreement: workflows, standards, the NEVER list.
   - [roadmap.md](project-memory/roadmap.md) — milestones, dependencies, cut lines, MVP gate.
   - [interview-notes.md](project-memory/interview-notes.md) — how each decision translates into interview material.
   - [session-history.md](project-memory/session-history.md) — chronological record of how the project evolved and what was rejected.
2. **[session-notes/implementation-handoff.md](session-notes/implementation-handoff.md)** — the operational handoff: exact current state, next task, blockers. **Updated at the end of every session.**
3. **[development-log.md](development-log.md)** — the engineering diary. **One entry appended per completed milestone.**
