import { describe, expect, it } from 'vitest';

import { createEmbedder, EMBEDDING_DIMENSIONS } from '../src/embedder.js';

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}

/**
 * Real model, no mocks (fixtures-over-mocks): downloads ~25 MB once into the
 * package cache (CI caches the directory). The similarity assertions pin the
 * property the product depends on — paraphrased failures land closer than
 * unrelated ones — with a wide margin, not exact values (quantized inference
 * may vary in low decimals across platforms).
 */
describe('embedder (real MiniLM inference)', () => {
  // CI points this at a cached directory; locally it defaults to the package cache.
  const modelDir = process.env.DEVFLOW_AI_MODEL_DIR;
  const embedder = createEmbedder(modelDir === undefined ? {} : { modelDir });

  it('produces normalized vectors of the declared dimension', { timeout: 120_000 }, async () => {
    const [vector] = await embedder.embed(['timeout waiting for payment gateway']);
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(cosine(vector!, vector!)).toBeCloseTo(1, 3);
  });

  it('ranks paraphrases above unrelated failures', { timeout: 120_000 }, async () => {
    const [timeout1, timeout2, assertion, redis] = await embedder.embed([
      'TimeoutError: timed out after 30000ms waiting for payment gateway response',
      'payment gateway did not respond within the 30s timeout',
      'AssertionError: expected 404 to equal 200 in GET /users/42',
      'connection refused: could not connect to redis at 127.0.0.1:6379',
    ]);
    const paraphrase = cosine(timeout1!, timeout2!);
    expect(paraphrase).toBeGreaterThan(0.6);
    expect(paraphrase).toBeGreaterThan(cosine(timeout1!, assertion!) + 0.2);
    expect(paraphrase).toBeGreaterThan(cosine(timeout1!, redis!) + 0.2);
  });

  it('returns [] for [] without loading anything', async () => {
    expect(await createEmbedder({ modelDir: '/nonexistent/never-touched' }).embed([])).toEqual([]);
  });

  it('embeds batches with one vector per input, order-aligned', { timeout: 120_000 }, async () => {
    const texts = ['first failure', 'second failure', 'first failure'];
    const vectors = await embedder.embed(texts);
    expect(vectors).toHaveLength(3);
    // Identical inputs embed identically (deterministic inference).
    expect(cosine(vectors[0]!, vectors[2]!)).toBeCloseTo(1, 5);
    expect(cosine(vectors[0]!, vectors[1]!)).toBeLessThan(0.999);
  });
});
