# birdwatch-web, the Birdwatch demo's website. Build from the repository root, with the design system submodule
# checked out (the site compiles it from source):
#   docker build -f apps/birdwatch-web/Dockerfile -t ctff-birdwatch-web .
# All configuration comes from environment variables: BIRDWATCH_API_URL (required), PORT, HOST, LOG_LEVEL.

FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    ASTRO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@ctff/birdwatch-web..."
RUN pnpm --filter "@ctff/birdwatch-web..." run build \
 && pnpm --filter @ctff/birdwatch-web deploy --prod /out

FROM node:24-slim
ENV NODE_ENV=production \
    ASTRO_TELEMETRY_DISABLED=1 \
    PORT=3000
WORKDIR /app
# Owned by root and read-only for the runtime user: the session token lives in the visitor's cookie only.
COPY --from=build /out /app
# The `node` user of the base image, by id so orchestrators can verify it isn't root.
USER 1000:1000
EXPOSE 3000
# Ready while birdwatch-api is (/health/ready).
HEALTHCHECK --interval=5s --timeout=3s --start-period=90s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
