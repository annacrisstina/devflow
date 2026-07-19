import { describe, expect, it } from 'vitest';

import { failureHash, failureText, MAX_EMBED_CHARS } from '../src/failure-text.js';

describe('failureText', () => {
  it('joins message and details with whitespace normalization', () => {
    expect(failureText('timeout  after\n30s', '  at gateway.ts:42\r\n  at run.ts:1  ')).toBe(
      'timeout after 30s at gateway.ts:42 at run.ts:1',
    );
  });

  it('works with message only and details only', () => {
    expect(failureText('boom', null)).toBe('boom');
    expect(failureText(null, 'stack')).toBe('stack');
  });

  it('returns null when there is nothing to embed', () => {
    expect(failureText(null, null)).toBeNull();
    expect(failureText('   ', '')).toBeNull();
  });

  it('caps at the embedding window', () => {
    const text = failureText('x'.repeat(5000), null);
    expect(text).toHaveLength(MAX_EMBED_CHARS);
  });
});

describe('failureHash', () => {
  it('is deterministic and format-stable', () => {
    expect(failureHash('timeout after 30s')).toBe(failureHash('timeout after 30s'));
    expect(failureHash('timeout after 30s')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different content', () => {
    expect(failureHash('timeout after 30s')).not.toBe(failureHash('timeout after 31s'));
  });

  it('normalized variants of the same failure hash identically', () => {
    const a = failureText('timeout  after 30s', 'at gateway.ts:42');
    const b = failureText('timeout after\n30s', '  at gateway.ts:42 ');
    expect(a).toBe(b);
    expect(failureHash(a!)).toBe(failureHash(b!));
  });
});
