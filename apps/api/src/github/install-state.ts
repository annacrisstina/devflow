import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The signed `state` that rides through GitHub's App-installation flow
 * (ADR-0012): proof that the person completing the install started from a
 * specific workspace's "Connect GitHub" button, bound to their user and
 * expiring quickly. Format: base64url(JSON payload) + '.' + base64url(HMAC).
 */
export type InstallState = {
  workspaceId: string;
  userId: string;
  /** Unix epoch seconds. */
  exp: number;
};

const DEFAULT_TTL_SECONDS = 15 * 60;

function hmac(secret: string, payload: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function createInstallState(
  secret: string,
  workspaceId: bigint,
  userId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const state: InstallState = {
    workspaceId: workspaceId.toString(),
    userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${payload}.${hmac(secret, payload).toString('base64url')}`;
}

/** Returns null for anything not verifiably ours and unexpired. */
export function verifyInstallState(secret: string, state: string): InstallState | null {
  const dot = state.indexOf('.');
  if (dot === -1) return null;
  const payload = state.slice(0, dot);
  const signature = state.slice(dot + 1);

  let given: Buffer;
  try {
    given = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  const expected = hmac(secret, payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.workspaceId !== 'string' ||
    typeof candidate.userId !== 'string' ||
    typeof candidate.exp !== 'number'
  ) {
    return null;
  }
  if (candidate.exp <= Math.floor(Date.now() / 1000)) return null;
  return { workspaceId: candidate.workspaceId, userId: candidate.userId, exp: candidate.exp };
}
