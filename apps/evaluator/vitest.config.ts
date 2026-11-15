import { defineConfig } from 'vitest/config';

// S3: the SDK's public API driving the built Evaluator (dist/main.js, started as its own process) against a fake
// Core built only from the shared types in @ctff/evaluation. `test` depends on `build`.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
