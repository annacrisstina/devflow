import { createPrivateKey, sign } from 'node:crypto';

/**
 * Mints the short-lived RS256 JWT that authenticates DevFlow as a GitHub App
 * (the first leg of the JWT → installation-token dance, ADR-0006/0009).
 *
 * Hand-rolled on node:crypto deliberately: `createPrivateKey` accepts both
 * PKCS#1 ("BEGIN RSA PRIVATE KEY" — what GitHub actually hands out) and
 * PKCS#8, which pure-JS JWT libraries commonly refuse.
 */
export function createAppJwt(appId: string, privateKeyPem: string, nowMs = Date.now()): string {
  const key = createPrivateKey(privateKeyPem);
  const nowSec = Math.floor(nowMs / 1000);
  const claims = {
    // Backdated 60s: GitHub rejects tokens "from the future" on clock drift.
    iat: nowSec - 60,
    // GitHub's maximum is 10 minutes from now; 8 leaves margin.
    exp: nowSec + 8 * 60,
    iss: appId,
  };
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), key);
  return `${header}.${payload}.${base64url(signature)}`;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}
