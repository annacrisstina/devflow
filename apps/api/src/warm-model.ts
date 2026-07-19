import { createEmbedder } from '@devflow/ai/embedder';

/**
 * Image-build step (ADR-0020): downloads the embedding model into
 * DEVFLOW_AI_MODEL_DIR and runs one inference so the layer is complete and
 * deterministic — deployed containers work air-gapped (ADR-0018). The API
 * needs the model because /search embeds the query in-process (ADR-0018).
 */
const modelDir = process.env.DEVFLOW_AI_MODEL_DIR;
const embedder = createEmbedder(modelDir === undefined ? {} : { modelDir });
await embedder.embed(['devflow model warmup']);
console.log(JSON.stringify({ msg: 'embedding model warmed', modelDir: modelDir ?? 'default' }));
