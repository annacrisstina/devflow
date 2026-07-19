/**
 * Redis pub/sub channel for live-feed events (ADR-0015). Lives here because
 * this package owns the api↔worker Redis contract; the event SHAPE lives in
 * @devflow/contract (types only). Publishing is fire-and-forget — a publish
 * failure must never fail ingestion.
 */
export const LIVE_EVENTS_CHANNEL = 'devflow:live-events';
