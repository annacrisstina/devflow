import type { FlakeVerdict } from '@devflow/contract/api';
import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

/**
 * Read-time score decay (ADR-0014, closing M3's recorded debt: stale
 * non-healthy scores persist until an identity reappears in a run).
 *
 * The stored score is a saturation of evidence: s = e/(e+K). Inverting gives
 * the evidence it represents, which then decays exactly like the detection
 * engine decays individual events (ADR-0010, half-life H):
 *
 *   e  = K·s/(1−s)
 *   e' = e · 2^(−Δdays/H)
 *   s' = e'/(e'+K)
 *
 * Same knobs as the worker (DEVFLOW_FLAKE_*), so a deployment that tunes
 * detection tunes the read model with it.
 */
export type FlakeReadConfig = {
  halfLifeDays: number;
  saturationK: number;
  flakyThreshold: number;
  suspectThreshold: number;
};

export function effectiveScore(
  storedScore: number,
  computedAt: Date,
  now: Date,
  config: FlakeReadConfig,
): number {
  // A score of exactly 1 is unreachable from the saturation formula; clamp
  // defensively so bad data cannot produce Infinity.
  const s = Math.min(Math.max(storedScore, 0), 0.999_999);
  const evidence = (config.saturationK * s) / (1 - s);
  const ageDays = Math.max(0, now.getTime() - computedAt.getTime()) / 86_400_000;
  const decayed = evidence * Math.pow(2, -ageDays / config.halfLifeDays);
  return decayed / (decayed + config.saturationK);
}

export function verdictFor(score: number, config: FlakeReadConfig): FlakeVerdict {
  if (score >= config.flakyThreshold) return 'flaky';
  if (score >= config.suspectThreshold) return 'suspected';
  return 'healthy';
}

/**
 * The same arithmetic as `effectiveScore`, as a SQL expression over
 * `test_flake_scores` columns — so ordering, verdict filtering and
 * pagination happen server-side on the CORRECT (decayed) value. The
 * integration suite pins this expression to the TS reference implementation;
 * if they ever drift, that test fails.
 *
 * Cast to double precision at the boundary: EXTRACT/power mix numeric into
 * the expression, and node-pg returns numeric as a string (the M3 raw-SQL
 * mapping lesson, applied preemptively).
 */
export function effectiveScoreSql(
  config: FlakeReadConfig,
  now: Date,
  scoreColumn: AnyColumn,
  computedAtColumn: AnyColumn,
): SQL<number> {
  const k = config.saturationK;
  const h = config.halfLifeDays;
  const evidence = sql`(${k} * LEAST(${scoreColumn}, 0.999999) / (1 - LEAST(${scoreColumn}, 0.999999)))`;
  const decayed = sql`(${evidence} * power(2, -GREATEST(EXTRACT(EPOCH FROM (${now.toISOString()}::timestamptz - ${computedAtColumn})), 0) / 86400.0 / ${h}))`;
  return sql<number>`CAST(${decayed} / (${decayed} + ${k}) AS double precision)`;
}
