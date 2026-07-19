/**
 * Live-feed event envelope (ADR-0015). Best-effort UI hints, NOT a durable
 * stream: REST is the source of truth, a missed event costs a refetch, never
 * correctness. Emitted by the worker onto Redis pub/sub, fanned out by the
 * API to workspace rooms; the Socket.IO event name equals `type`.
 */
export type LiveEventType = 'run.ingested' | 'run.processed' | 'scores.updated';

export type LiveEvent = {
  type: LiveEventType;
  /** Room key — resolved by the publisher; unclaimed installations emit nothing. */
  workspaceId: string;
  /** "owner/name". */
  repository: string;
  githubRunId: string;
  runAttempt: number;
  /** Publisher wall-clock, ISO-8601. */
  at: string;
  /** run.processed only: succeeded | no_artifacts | failed. */
  processingStatus?: string;
};
