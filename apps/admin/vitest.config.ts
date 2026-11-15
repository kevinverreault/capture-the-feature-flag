import { defineConfig } from 'vitest/config';

// The admin app has no tests of its own beyond its pure helpers (the UI is covered end to end by S5).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
