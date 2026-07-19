# ADR-0018: Local embeddings, content-addressed storage, and deterministic clustering

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** founder + lead engineer

## Context

M5's two key-free features — semantic search over failure history and failure clustering — need vector representations of failure texts. D5 committed pgvector-in-Postgres at M0 (the compose _and_ CI images have shipped `pgvector/pgvector:pg17` since day one, waiting for this milestone). The open questions were the embedding source (the self-hosting invariant, NEVER-#11, forbids a _required_ managed dependency), the storage shape (test results are replace-per-run and repeat identical failure texts endlessly), and how clustering works without an LLM. The founder gated the local-inference choice on measured numbers from the dev machine.

## Decision

**Embed locally with `all-MiniLM-L6-v2` (quantized ONNX, 384 dims) via `@huggingface/transformers`, in-process on CPU. Store one embedding per distinct failure text per repository, content-addressed by sha256. Search is exact cosine in pgvector; clustering is greedy single-link over the stored vectors in TypeScript.**

- **Model & runtime (the founder gate, measured):** ~25 MB one-time download, ~0.4 s warm load, ~150 MB RSS, **2–6 ms per short text** on the WSL2 dev machine; paraphrased failures scored 0.79–0.82 cosine vs 0.22–0.23 for unrelated pairs — exactly the separation the features need. The task is paraphrase/near-duplicate retrieval over short technical text, which is what small sentence-transformers are for. A pleasant supply-chain fact, recorded: `onnxruntime-node` ships prebuilt binaries and works with pnpm 10's lifecycle-script blocking (D13) fully intact — no build-script exception needed.
- **Canonical text + content addressing:** `failure_message + failure_details`, whitespace-normalized, capped at ~1000 chars (the model's effective window); sha256 of that text is the content address. `test_results.failure_hash` (nullable, failures only) makes "which tests/runs hit this failure" a join; `failure_embeddings` is unique per `(repository_id, content_hash)`, so a flaky test that repeats one message ten thousand times embeds **once**. Under replace-per-run reprocessing everything converges (hashes recompute identically; upserts touch timestamps). Smarter normalization (timestamps, hex addresses) is recorded post-MVP work — it changes hashes, so it is a migration, not a tweak.
- **No occurrence counters stored:** counts come from joining `test_results` at read time. A maintained counter would drift under reprocess — the honest-derived-data rule (ADR-0008/0014 lineage).
- **Search: exact scan, no ANN index.** MVP-scale deployments hold thousands of distinct failure texts; exact cosine over that is milliseconds. **HNSW is the recorded trigger** (~100k+ embeddings in one deployment), same reasoning class as deferred partitioning (ADR-0008). The extension is created in migration 0004 (`CREATE EXTENSION IF NOT EXISTS vector`).
- **Clustering is geometry, not generation:** greedy single-link over cosine ≥ threshold (default 0.80, `DEVFLOW_AI_CLUSTER_THRESHOLD`), pure function over Float32Arrays, window-bounded (~1000 vectors) and computed per request — nothing stored, nothing to drift. Medoid snippet represents each cluster; clusters rank by affected-failure weight. An LLM could only ever _label_ what this already grouped.
- **Failure isolation:** the worker's embedding stage is flag-gated (`DEVFLOW_AI_EMBEDDINGS`), bounded per run, and can never fail or retry an ingestion job — same contract as the live feed (ADR-0015). The embedder loads lazily (a process that never embeds never pays the load) from `DEVFLOW_AI_MODEL_DIR`; offline deployments pre-seed that directory.

## Alternatives considered

- **API embeddings (OpenAI/Voyage)** — rejected: makes _search itself_ key-gated and network-dependent, gutting the self-host story for quality this use case cannot feel. Recorded as the fallback had local inference failed the founder gate (it did not).
- **Ollama / a local model server** — rejected: a whole service to operate for what a 25 MB in-process library call provides.
- **Bigger local models (bge, mpnet)** — rejected: 2–5× latency and memory for marginal gains on near-duplicate retrieval.
- **Embedding per test_results row** — rejected: re-embeds identical text endlessly and ties embedding lifetime to replace-per-run deletion; content addressing decouples both.
- **HNSW/IVFFlat now** — rejected: index build/maintenance cost against datasets where exact scan is already instant; trigger recorded instead.
- **k-means / LLM-labeled clustering** — rejected: k must be known (it is the unknown), and LLM clustering buys nondeterminism and cost for what dot products do.

## Consequences

- First use on a fresh machine downloads the model from the Hugging Face CDN — documented; CI caches the directory; air-gapped installs pre-seed it (M6 owns the compose volume note).
- The API process embeds only search queries (lazy load on first search); the worker embeds new failure texts. Both share `@devflow/ai`.
- Embedding dimension (384) is baked into the schema (`vector(384)`); changing models later means a re-embed migration — acceptable, and the content-addressed store makes it a bounded rebuild.
- D5 (pgvector) flips to **Locked** with this ADR.
