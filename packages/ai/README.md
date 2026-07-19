# @devflow/ai

**The amputable AI layer** (ADR-0017). Three things, nothing else: a local failure-text embedder (MiniLM, quantized ONNX, CPU — ADR-0018), the canonical failure-text normalization + content hash, deterministic embedding-space clustering, and (from M5-C4) the BYO-key LLM client for human-triggered root-cause hypotheses (ADR-0019).

**Boundaries — read before importing this anywhere:**

- The full list of permitted call sites lives in **ADR-0017**; importing this package from detection, quarantine, annotation, or any decision-making write path is a boundary violation, not a convenience.
- Everything here is advisory input to humans. Nothing in this package may write product state other than embeddings and cached hypothesis text.
- Deleting this package plus the enumerated call sites must leave `pnpm verify` green and the product fully functional — that is the definition of done for any change made here.

Measured on the reference dev machine: ~25 MB one-time model download, ~0.4 s warm model load, ~150 MB process RSS, 2–6 ms per embedded text. Offline deployments pre-seed the model cache directory (`DEVFLOW_AI_MODEL_DIR`).
