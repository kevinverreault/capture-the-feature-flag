import { defineConfig } from 'vitest/config';

// S2: Core's public HTTP API against real PostgreSQL. Each test file starts the built Core (dist/main.js) as a
// separate process on its own fresh database, so `test` depends on `build`.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
