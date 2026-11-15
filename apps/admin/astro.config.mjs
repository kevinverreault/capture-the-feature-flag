import node from '@astrojs/node';
import designSystem from '@ctff/design-system-host';
import { defineConfig } from 'astro/config';

// Server-rendered, built as a Node middleware that Core mounts (ADR 0003). host.js wraps it for hosts.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  integrations: [designSystem()],
  security: {
    // The operator serves the admin app under whatever hostname they choose, so trust the Host header: an empty
    // pattern matches any host. Astro then compares a form post's Origin with that host (checkOrigin), which
    // rejects cross-site posts. The admin app never derives Core's address from the request.
    allowedDomains: [{}],
  },
});
