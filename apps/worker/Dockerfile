# DevFlow worker image (ADR-0020). The embedding model is baked into the
# image at build time (ADR-0018): deploys work air-gapped, first boot is
# deterministic, and the layer caches until the model id changes.
FROM node:22-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo build --filter=@devflow/worker
# --legacy: see apps/api/Dockerfile.
RUN pnpm --filter @devflow/worker deploy --legacy --prod /out/worker

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/worker /app
ENV DEVFLOW_AI_MODEL_DIR=/app/models
RUN node dist/warm-model.js && chown -R node:node /app/models
EXPOSE 3002
USER node
CMD ["node", "dist/main.js"]
