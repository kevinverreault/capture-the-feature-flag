# Core (the admin app joins it later). Build from the repository root:
#   docker build -f apps/core/Dockerfile -t ctff-core .
# All configuration comes from environment variables: DATABASE_URL (required), PORT, HOST, LOG_LEVEL.

FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@ctff/core..."
RUN pnpm --filter @ctff/core run generate \
 && pnpm --filter "@ctff/core..." run build \
 && pnpm --filter @ctff/core deploy --prod /out

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# Owned by root and read-only for the runtime user: Core keeps no local state.
COPY --from=build /out /app
# The `node` user of the base image, by id so orchestrators can verify it isn't root.
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
