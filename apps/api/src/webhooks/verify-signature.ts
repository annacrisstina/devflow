import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies GitHub's X-Hub-Signature-256 header against the raw request bytes.
 *
 * Must be called with the body exactly as received — any re-serialization
 * (e.g. JSON.parse → stringify) silently breaks verification on payloads
 * whose formatting differs from ours.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  secret: string,
  signatureHeader: string,
): boolean {
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`,
  );
  const received = Buffer.from(signatureHeader);
  // timingSafeEqual requires equal lengths; the length check leaks nothing
  // secret (the expected format is public knowledge).
  return received.length === expected.length && timingSafeEqual(received, expected);
}
