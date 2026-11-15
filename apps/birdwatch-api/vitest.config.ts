import { defineConfig } from 'vitest/config';

// Birdwatch has no tests of its own beyond S5, apart from these unit tests of its pure helpers.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
