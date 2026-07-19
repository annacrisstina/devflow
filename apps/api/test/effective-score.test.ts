import { describe, expect, it } from 'vitest';

import { effectiveScore, verdictFor, type FlakeReadConfig } from '../src/flake/effective-score.js';

// ADR-0010 reference values.
const CONFIG: FlakeReadConfig = {
  halfLifeDays: 14,
  saturationK: 2.0,
  flakyThreshold: 0.5,
  suspectThreshold: 0.25,
};

const NOW = new Date('2026-07-19T12:00:00Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

/**
 * Pins ADR-0014's read-model arithmetic the way the detection unit tests pin
 * ADR-0010: worked reference numbers, not "roughly right".
 *
 * s = 0.5 with K = 2 represents evidence e = 2. One half-life later e = 1,
 * so s' = 1/(1+2) = 1/3. Two half-lives: e = 0.5, s' = 0.5/2.5 = 0.2.
 */
describe('effectiveScore', () => {
  it('returns the stored score unchanged at age zero', () => {
    expect(effectiveScore(0.5, NOW, NOW, CONFIG)).toBeCloseTo(0.5, 10);
    expect(effectiveScore(0.3323, NOW, NOW, CONFIG)).toBeCloseTo(0.3323, 10);
  });

  it('decays s=0.5 to exactly 1/3 after one half-life', () => {
    expect(effectiveScore(0.5, daysAgo(14), NOW, CONFIG)).toBeCloseTo(1 / 3, 10);
  });

  it('decays s=0.5 to exactly 0.2 after two half-lives', () => {
    expect(effectiveScore(0.5, daysAgo(28), NOW, CONFIG)).toBeCloseTo(0.2, 10);
  });

  it('a zero score stays zero forever', () => {
    expect(effectiveScore(0, daysAgo(365), NOW, CONFIG)).toBe(0);
  });

  it('a future computedAt (clock skew) is treated as age zero, never amplified', () => {
    expect(effectiveScore(0.5, daysAgo(-1), NOW, CONFIG)).toBeCloseTo(0.5, 10);
  });

  it('clamps pathological stored scores instead of dividing by zero', () => {
    const result = effectiveScore(1, NOW, NOW, CONFIG);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeLessThanOrEqual(1);
  });
});

describe('verdictFor', () => {
  it('applies thresholds inclusively, matching the detection engine', () => {
    expect(verdictFor(0.5, CONFIG)).toBe('flaky');
    expect(verdictFor(0.499999, CONFIG)).toBe('suspected');
    expect(verdictFor(0.25, CONFIG)).toBe('suspected');
    expect(verdictFor(0.249999, CONFIG)).toBe('healthy');
    expect(verdictFor(0, CONFIG)).toBe('healthy');
  });

  it('the M3 e2e reference (0.3323) reads as suspected, decaying to healthy in ~28 days', () => {
    expect(verdictFor(effectiveScore(0.3323, NOW, NOW, CONFIG), CONFIG)).toBe('suspected');
    expect(verdictFor(effectiveScore(0.3323, daysAgo(28), NOW, CONFIG), CONFIG)).toBe('healthy');
  });
});
