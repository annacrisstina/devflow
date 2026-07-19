# DevFlow API image (ADR-0020): Fastify API + the built dashboard SPA served
# same-origin (ADR-0013). node:22-slim (Debian): glibc for native prebuilds,
# and the .nvmrc-targeted Node finally runs somewhere real.
FROM node:22-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
# .dockerignore keeps this to sources + manifests; deps come from the lockfile.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo build --filter=@devflow/api --filter=@devflow/web
# Pruned production layout: the app, its dist, and production deps only.
# --legacy: classic pack-based deploy (pnpm v10 default needs injected
# workspaces); our packages publish dist via "files", which legacy packs.
RUN pnpm --filter @devflow/api deploy --legacy --prod /out/api

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/api /app
# The dashboard build, served by the API behind DEVFLOW_WEB_DIST.
COPY --from=build /app/apps/web/dist /app/web-dist
# Committed migrations for the one-shot migrate service (same image,
# different command — see compose.yaml).
COPY --from=build /app/packages/db/migrations /app/migrations
ENV DEVFLOW_WEB_DIST=/app/web-dist
ENV DEVFLOW_MIGRATIONS_DIR=/app/migrations
# /search embeds queries in-process, so the API bakes the model exactly like
# the worker does (ADR-0018/0020).
ENV DEVFLOW_AI_MODEL_DIR=/app/models
RUN node dist/warm-model.js && chown -R node:node /app/models
EXPOSE 3001
USER node
CMD ["node", "dist/server.js"]
