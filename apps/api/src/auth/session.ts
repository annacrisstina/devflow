import type { Db } from '@devflow/db/client';
import { sessions, users } from '@devflow/db/schema/auth';
import { and, eq, gt } from 'drizzle-orm';

/**
 * With the database session strategy (ADR-0013) the cookie value IS the
 * `sessions.session_token` row key, so authenticating an API request is one
 * indexed join — no round-trip through the Auth.js handler. Cookie names are
 * Auth.js's contract: plain on http (dev), __Secure- prefixed on https.
 */
const SESSION_COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token'];

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    // Cookie values may be URL-encoded; session tokens are UUIDs but decode
    // defensively so a future encoded value doesn't silently fail lookup.
    cookies.set(name, decodeURIComponent(part.slice(eq + 1).trim()));
  }
  return cookies;
}

export async function resolveSessionUser(
  db: Db,
  cookieHeader: string | undefined,
): Promise<SessionUser | null> {
  const cookies = parseCookies(cookieHeader);
  const token = SESSION_COOKIE_NAMES.map((name) => cookies.get(name)).find(
    (value) => value !== undefined,
  );
  if (token === undefined || token === '') return null;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.sessionToken, token), gt(sessions.expires, new Date())))
    .limit(1);

  return rows[0] ?? null;
}
