import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyWebhookSignature } from '../src/webhooks/verify-signature.js';

const SECRET = 'test-webhook-secret';

function sign(body: Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyWebhookSignature', () => {
  const body = Buffer.from('{"action":"completed"}');

  it('accepts a correct signature', () => {
    expect(verifyWebhookSignature(body, SECRET, sign(body, SECRET))).toBe(true);
  });

  it('rejects a signature computed with a different secret', () => {
    expect(verifyWebhookSignature(body, SECRET, sign(body, 'wrong-secret'))).toBe(false);
  });

  it('rejects a signature for different bytes', () => {
    const tampered = Buffer.from('{"action":"completed" }');
    expect(verifyWebhookSignature(tampered, SECRET, sign(body, SECRET))).toBe(false);
  });

  it('rejects malformed headers without throwing', () => {
    expect(verifyWebhookSignature(body, SECRET, '')).toBe(false);
    expect(verifyWebhookSignature(body, SECRET, 'sha256=nothex')).toBe(false);
    expect(verifyWebhookSignature(body, SECRET, 'sha1=deadbeef')).toBe(false);
  });
});
