# birdwatch-api, the Birdwatch demo's backend. Build from the repository root:
#   docker build -f apps/birdwatch-api/Dockerfile -t ctff-birdwatch-api .
# All configuration comes from environment variables: EVALUATOR_URL (required), CTFF_SDK_KEY or CORE_URL (with
# CTFF_PROJECT and CTFF_ENVIRONMENT) for the SDK key, PORT, HOST, LOG_LEVEL, CTFF_TIMEOUT_MS, SESSION_SECRET.

FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@ctff/birdwatch-api..."
# Builds its dependencies first: the core-api-client (generated from its copy of Core's OpenAPI document), the SDK
# and the NestJS module.
RUN pnpm --filter "@ctff/birdwatch-api..." run build \
 && pnpm --filter @ctff/birdwatch-api deploy --prod /out

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# Owned by root and read-only for the runtime user: logged sightings are kept in memory only.
COPY --from=build /out /app
# The `node` user of the base image, by id so orchestrators can verify it isn't root.
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=90s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
