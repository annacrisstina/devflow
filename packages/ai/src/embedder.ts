import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

/**
 * Local failure-text embedder (ADR-0018): all-MiniLM-L6-v2, quantized ONNX,
 * CPU inference in-process. Chosen so semantic search and clustering work in
 * a self-hosted deployment with no managed dependency and no API key
 * (NEVER-list #11). Measured on the dev machine: ~0.4 s warm model load,
 * ~150 MB RSS, 2–6 ms per short text.
 *
 * The model downloads once (~25 MB) into `modelDir` on first use; offline
 * deployments pre-seed that directory.
 */
export const EMBEDDING_DIMENSIONS = 384;

export const EMBEDDING_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

export type Embedder = {
  /** Returns one L2-normalized vector per input text (cosine = dot). */
  embed: (texts: string[]) => Promise<Float32Array[]>;
};

export type EmbedderOptions = {
  /** Where model files are cached; defaults to the library's package cache. */
  modelDir?: string;
};

/**
 * Lazy singleton per process: the model loads on the first embed call, not at
 * boot — an API process that never serves a search never pays the load.
 */
export function createEmbedder(options: EmbedderOptions = {}): Embedder {
  let loading: Promise<FeatureExtractionPipeline> | undefined;

  function load(): Promise<FeatureExtractionPipeline> {
    if (loading === undefined) {
      if (options.modelDir !== undefined) {
        env.cacheDir = options.modelDir;
      }
      loading = pipeline('feature-extraction', EMBEDDING_MODEL_ID, { dtype: 'q8' });
    }
    return loading;
  }

  return {
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const extractor = await load();
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      const [count, dimensions] = output.dims;
      if (count !== texts.length || dimensions !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `unexpected embedding shape ${output.dims.join('x')} for ${texts.length} texts`,
        );
      }
      const data = output.data as Float32Array;
      // Copy per-text vectors out of the shared output buffer: callers hold
      // these beyond the tensor's lifetime.
      return Array.from({ length: count }, (_, i) =>
        data.slice(i * EMBEDDING_DIMENSIONS, (i + 1) * EMBEDDING_DIMENSIONS),
      );
    },
  };
}
