import { describe, expect, it } from 'vitest';

import { clusterBySimilarity, type ClusterItem } from '../src/clustering.js';

/** Unit vector in a 4-dim space, optionally nudged and renormalized. */
function vec(values: [number, number, number, number]): Float32Array {
  const v = new Float32Array(values);
  const norm = Math.hypot(...values);
  for (let i = 0; i < v.length; i++) v[i] = v[i]! / norm;
  return v;
}

const timeoutA: ClusterItem = { id: 'timeout-a', vector: vec([1, 0.05, 0, 0]), weight: 10 };
const timeoutB: ClusterItem = { id: 'timeout-b', vector: vec([1, 0.1, 0, 0]), weight: 5 };
const timeoutC: ClusterItem = { id: 'timeout-c', vector: vec([1, 0, 0.05, 0]), weight: 1 };
const redisA: ClusterItem = { id: 'redis-a', vector: vec([0, 1, 0.05, 0]), weight: 2 };
const redisB: ClusterItem = { id: 'redis-b', vector: vec([0.05, 1, 0, 0]), weight: 2 };
const lonely: ClusterItem = { id: 'npe', vector: vec([0, 0, 0, 1]), weight: 7 };

describe('clusterBySimilarity', () => {
  it('groups near-identical vectors and separates orthogonal ones', () => {
    const clusters = clusterBySimilarity(
      [timeoutA, redisA, timeoutB, lonely, redisB, timeoutC],
      0.9,
    );
    expect(clusters).toHaveLength(3);
    const byIds = clusters.map((c) => [...c.memberIds].sort());
    expect(byIds).toContainEqual(['timeout-a', 'timeout-b', 'timeout-c']);
    expect(byIds).toContainEqual(['redis-a', 'redis-b']);
    expect(byIds).toContainEqual(['npe']);
  });

  it('ranks clusters by total weight, biggest first', () => {
    const clusters = clusterBySimilarity(
      [redisA, redisB, lonely, timeoutA, timeoutB, timeoutC],
      0.9,
    );
    expect(clusters.map((c) => c.totalWeight)).toEqual([16, 7, 4]);
  });

  it('elects the medoid as representative', () => {
    // timeout-a sits between b and c; it is most similar to the rest.
    const clusters = clusterBySimilarity([timeoutB, timeoutC, timeoutA], 0.9);
    expect(clusters[0]?.representativeId).toBe('timeout-a');
  });

  it('a singleton is its own representative', () => {
    const clusters = clusterBySimilarity([lonely], 0.9);
    expect(clusters).toEqual([{ memberIds: ['npe'], representativeId: 'npe', totalWeight: 7 }]);
  });

  it('threshold 1.0+ isolates everything; threshold 0 merges everything non-negative', () => {
    const items = [timeoutA, timeoutB, redisA];
    expect(clusterBySimilarity(items, 1.01)).toHaveLength(3);
    expect(clusterBySimilarity(items, 0)).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(clusterBySimilarity([], 0.8)).toEqual([]);
  });

  it('single-link chains transitively (a~b, b~c merges a,b,c even if a!~c)', () => {
    const a: ClusterItem = { id: 'a', vector: vec([1, 0, 0, 0]), weight: 1 };
    const b: ClusterItem = { id: 'b', vector: vec([1, 0.45, 0, 0]), weight: 1 };
    const c: ClusterItem = { id: 'c', vector: vec([1, 0.95, 0, 0]), weight: 1 };
    // sim(a,b) ≈ 0.91, sim(b,c) ≈ 0.95, sim(a,c) ≈ 0.72 — below threshold.
    const clusters = clusterBySimilarity([a, b, c], 0.9);
    expect(clusters).toHaveLength(1);
    expect([...clusters[0]!.memberIds].sort()).toEqual(['a', 'b', 'c']);
  });
});
