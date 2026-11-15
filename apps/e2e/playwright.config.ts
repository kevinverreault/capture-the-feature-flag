import { defineConfig, devices } from '@playwright/test';

/**
 * The end-to-end suite (S5), over the whole compose stack: the global setup attaches to it or starts it (see
 * src/global-setup.ts). Scenarios share the stack's one database, Evaluator and Birdwatch demo, and change its
 * targeting, so they run one at a time.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './src/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  timeout: 120_000,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // A Chromium of your own, where Playwright's can't be installed (`playwright install chromium`).
        launchOptions: process.env['E2E_CHROMIUM_EXECUTABLE']
          ? { executablePath: process.env['E2E_CHROMIUM_EXECUTABLE'] }
          : {},
      },
    },
  ],
});
