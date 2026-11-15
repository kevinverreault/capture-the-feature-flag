# The showcase website: built statically with Astro, served by nginx. Build from the repository root, with the
# design system submodule checked out (the site compiles it from source):
#   docker build -f apps/showcase/Dockerfile -t ctff-showcase .
# Configuration comes from environment variables: PORT (default 8080).

FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    ASTRO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@ctff/showcase..."
# The site needs only the design system integration built; the guides' samples are shown as text.
RUN pnpm --filter @ctff/design-system-host run build \
 && pnpm --filter @ctff/showcase run build

# nginx as a non-root user (101), listening on an unprivileged port.
FROM nginxinc/nginx-unprivileged:stable-alpine
ENV PORT=8080 \
    NGINX_ENTRYPOINT_QUIET_LOGS=1
# The image renders /etc/nginx/templates/*.template into /etc/nginx/conf.d at startup.
COPY apps/showcase/nginx/default.conf.template /etc/nginx/templates/default.conf.template
# Owned by root and read-only for the runtime user: the site is static files only.
COPY --from=build /repo/apps/showcase/dist /usr/share/nginx/html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
