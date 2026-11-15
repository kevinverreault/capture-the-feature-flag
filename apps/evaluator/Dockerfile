# The Evaluator. Build from the repository root:
#   docker build -f apps/evaluator/Dockerfile -t ctff-evaluator .
# All configuration comes from environment variables: CORE_URL (required), PORT, HOST, LOG_LEVEL,
# POLL_INTERVAL_MS, CORE_TIMEOUT_MS, TELEMETRY_FLUSH_INTERVAL_MS, TELEMETRY_MAX_SEEN_CONTEXTS.

FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@ctff/evaluator..."
RUN pnpm --filter "@ctff/evaluator..." run build \
 && pnpm --filter @ctff/evaluator deploy --prod /out

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# Owned by root and read-only for the runtime user: the Evaluator keeps its snapshots in memory only.
COPY --from=build /out /app
# The `node` user of the base image, by id so orchestrators can verify it isn't root.
USER 1000:1000
EXPOSE 3000
# Healthy once the first snapshots are loaded (/health/ready).
HEALTHCHECK --interval=5s --timeout=3s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
