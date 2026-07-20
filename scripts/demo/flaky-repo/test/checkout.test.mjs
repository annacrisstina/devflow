import { describe, expect, it } from 'vitest';

// How often the flaky tests fail (0..1). Tune per push via the workflow env
// if you want faster or slower evidence accumulation.
const FLAKE_RATE = Number(process.env.FLAKE_RATE ?? 0.35);

describe('checkout', () => {
  it('adds an item to the cart', () => {
    expect([1, 2, 3].length).toBe(3);
  });

  it('computes the order total', () => {
    expect(19.99 + 5.0).toBeCloseTo(24.99);
  });

  it('retries the payment gateway on timeout', () => {
    // Deliberately flaky: DevFlow should flag this one after a few re-runs.
    if (Math.random() < FLAKE_RATE) {
      throw new Error('TimeoutError: timed out after 30000ms waiting for payment gateway response');
    }
    expect(true).toBe(true);
  });

  it('invalidates the cart cache after purchase', () => {
    // A second, rarer flake with a different failure text (feeds DevFlow's
    // failure clustering with a distinct cluster).
    if (Math.random() < FLAKE_RATE / 2) {
      throw new Error('stale cache entry: cart version 12 expected, found 11');
    }
    expect(true).toBe(true);
  });
});
