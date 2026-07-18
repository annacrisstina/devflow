/**
 * Failure classification is the retry policy (ADR-0007):
 *
 * - PermanentJobError → the job can never succeed (missing data, expired
 *   artifact, malformed payload). The worker records the reason, marks the run
 *   failed, and COMPLETES the job — retrying the unretryable melts queues.
 * - Every other thrown error is treated as transient → rethrown so BullMQ
 *   retries with backoff, landing in the failed set (DLQ) after 5 attempts.
 */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}
