import node from '@astrojs/node';
import designSystem from '@ctff/design-system-host';
import { defineConfig } from 'astro/config';

// Server-rendered, built as a Node middleware that server.js serves with JSON logs.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  integrations: [designSystem()],
  security: {
    // Served under whatever hostname the operator chooses, so trust the Host header: an empty pattern matches any
    // host. Astro then compares a form post's Origin with that host (checkOrigin), which rejects cross-site posts.
    allowedDomains: [{}],
  },
});
