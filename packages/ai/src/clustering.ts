/**
 * Deterministic embedding-space clustering (ADR-0018): "these 40 failures
 * share one cause" is geometry, not generation. Greedy single-link over
 * cosine similarity — vectors arrive L2-normalized (the embedder guarantees
 * it), so similarity is a dot product.
 *
 * Pure function; O(n²) dot products over Float32Arrays. Callers bound n
 * (the API caps the window); at the cap (~1000) this is well under a second.
 */
export type ClusterItem = {
  id: string;
  vector: Float32Array;
  /** How many observed failures this (deduplicated) item represents. */
  weight: number;
};

export type Cluster = {
  memberIds: string[];
  /** Medoid: the member most similar to the rest — the display snippet. */
  representativeId: string;
  totalWeight: number;
};

export function clusterBySimilarity(items: ClusterItem[], threshold: number): Cluster[] {
  const n = items.length;
  if (n === 0) return [];

  // Union-find: single-link means one above-threshold pair merges clusters.
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  const similarity = (a: Float32Array, b: Float32Array): number => {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
    return dot;
  };

  // Cache pairwise sims for the medoid pass; n is caller-bounded.
  const sims: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = similarity(items[i]!.vector, items[j]!.vector);
      sims[i]![j] = s;
      sims[j]![i] = s;
      if (s >= threshold) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group === undefined) groups.set(root, [i]);
    else group.push(i);
  }

  const clusters: Cluster[] = [];
  for (const members of groups.values()) {
    let representative = members[0]!;
    if (members.length > 1) {
      let best = -Infinity;
      for (const candidate of members) {
        let sum = 0;
        for (const other of members) {
          if (other !== candidate) sum += sims[candidate]![other]!;
        }
        if (sum > best) {
          best = sum;
          representative = candidate;
        }
      }
    }
    clusters.push({
      memberIds: members.map((i) => items[i]!.id),
      representativeId: items[representative]!.id,
      totalWeight: members.reduce((sum, i) => sum + items[i]!.weight, 0),
    });
  }

  // Biggest problems first.
  return clusters.sort((a, b) => b.totalWeight - a.totalWeight);
}
