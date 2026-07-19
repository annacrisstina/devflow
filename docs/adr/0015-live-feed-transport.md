# ADR-0015: Live feed — Redis pub/sub to Socket.IO rooms, best-effort by contract

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** founder + lead engineer

## Context

M4's dashboard should feel alive: runs appearing as they are ingested, scores updating as detection completes. The computation happens in `apps/worker`; the browser connection terminates at `apps/api` — so events must cross a **process** boundary even with a single instance of each (this, not multi-instance scaling, is why a broker is involved at all). D4 committed the transport family long ago: self-hosted Socket.IO with Redis as the fan-out backbone — real-time infrastructure we own is a named portfolio goal, and the roadmap's cut line ("live feed degrades to polling") must stay a degradation, not a redesign.

## Decision

**The worker PUBLISHes JSON envelopes to one Redis pub/sub channel (`devflow:live-events`); the API subscribes and re-emits into per-workspace Socket.IO rooms. The stream is explicitly a UI freshness hint — REST remains the only source of truth.**

- **Envelope** (`@devflow/contract/events`): `run.ingested`, `run.processed` (with final `processingStatus`), `scores.updated` — no payloads to act on, just enough to know _what to refetch_. The channel name lives in `@devflow/queue` (the api↔worker Redis contract); the shape lives in the types-only contract package.
- **The worker resolves `workspaceId` at publish time** (one indexed lookup): the API's fan-out stays a dumb `io.to(room).emit()`. Unclaimed installations publish nothing — there is no room to deliver to.
- **Fire-and-forget is a hard contract on both sides:** the publisher swallows and logs every failure (a live-feed hiccup must never fail or retry an ingestion job — results and scores are already durable); the subscriber drops malformed messages. Publishing rides its own Redis connection (BullMQ owns the worker's), and subscribing rides its own (ioredis subscriber mode can issue no other commands).
- **Handshake auth = the session cookie** (same origin as REST, ADR-0013); unauthenticated handshakes are refused. Rooms (`ws:<id>`) are joined from workspace memberships at connect time; new memberships apply on the next connect — acceptable for a hint stream.
- **Delivery semantics, stated plainly:** at-most-once, unordered, no replay, no catch-up. Clients treat every event as "something changed — refetch what you show." This is what makes the polling cut line a one-line change (TanStack Query interval instead of event-triggered refetch).

## Alternatives considered

- **Socket.IO Redis adapter now** — solves multi-instance _socket_ scaling, which does not exist (one API instance until M6+); the plain subscriber solves the actual problem (worker→api process hop). The adapter is the recorded path when the API scales horizontally.
- **Postgres LISTEN/NOTIFY** — rejected: couples fan-out load to the source-of-truth database, 8000-byte payload ceiling, and Redis is already load-bearing in the stack.
- **BullMQ events / a queue as the transport** — rejected: queues are for work that must happen (ADR-0007); a UI hint that must NOT be retried or persisted is the opposite contract.
- **Server-Sent Events / raw `ws`** — rejected in D4 already: Socket.IO's rooms, reconnection and fallbacks are exactly the boilerplate not worth rewriting; SSE additionally lacks rooms entirely.
- **Durable event stream with replay (event IDs + catch-up)** — rejected for MVP: it reinvents what REST-on-reconnect already provides for a dashboard; complexity without a consumer.

## Consequences

- A dropped Redis connection or API restart silently loses in-flight events — by design; the UI's next REST fetch heals it. Nothing operational depends on this stream.
- The worker performs one extra indexed SELECT per published event (≤3 per job) — negligible against artifact download/parse.
- Socket.IO attaches to the same HTTP server and origin as REST, so cookies, TLS and deployment topology stay single-surface; the SPA needs no extra endpoint config.
- Events fire only for claimed installations: dashboards show live activity strictly within their tenant (the same chain ADR-0012 uses everywhere else).
