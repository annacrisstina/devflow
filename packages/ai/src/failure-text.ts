import { createHash } from 'node:crypto';

/**
 * The canonical text form of a test failure for embedding and deduplication
 * (ADR-0018). Content-addressing depends on this being deterministic:
 * message + details, whitespace-normalized, capped near the embedding
 * model's effective window (~256 tokens). Smarter normalization (stripping
 * timestamps, hex addresses) is a recorded post-MVP improvement — it changes
 * hashes, so it must be a deliberate migration, not a tweak.
 */
export const MAX_EMBED_CHARS = 1000;

export function failureText(
  failureMessage: string | null,
  failureDetails: string | null,
): string | null {
  const joined = [failureMessage, failureDetails]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .join('\n');
  if (joined === '') return null;
  const normalized = joined.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, MAX_EMBED_CHARS);
}

/** sha256 hex of the canonical text — the content address. */
export function failureHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
