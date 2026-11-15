import { defineConfig } from 'vitest/config';

// S1: the pure evaluation function, with table tests.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
