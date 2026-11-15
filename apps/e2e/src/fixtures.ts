import {
  test as base,
  expect,
  type Browser,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from '@playwright/test';
import type { EvaluationReason } from '@ctff/core-api-client';
import { birders, resetDemo, type BirderId } from './demo.js';
import { urls, withinPollInterval } from './stack.js';

/**
 * The timeout of one attempt of an expectation retried by {@link reloadUntil}: each attempt checks the page as it
 * loaded, and the retry does the waiting. (A timeout of 0 would wait forever.)
 */
export const perAttempt = { timeout: 500 };

/**
 * Loads `url` in `page` again and again until `expectation` holds, for at most `timeout` ms: what a page shows
 * once a change made elsewhere (targeting, telemetry) has reached the service rendering it.
 */
export async function reloadUntil(
  page: Page,
  url: string,
  expectation: () => Promise<void>,
  { timeout, interval = 250 }: { timeout: number; interval?: number },
): Promise<void> {
  await expect(async () => {
    await page.goto(url);
    await expectation();
  }).toPass({ timeout, intervals: [interval] });
}

/** Birdwatch's website, logged in as one birder in a browser context of their own. */
export class BirdwatchSession {
  constructor(readonly page: Page) {}

  /** `colorScheme` is the one the browser's system prefers, which the design system's theme follows by default. */
  static async logIn(
    browser: Browser,
    birder: BirderId,
    colorScheme?: BrowserContextOptions['colorScheme'],
  ): Promise<BirdwatchSession> {
    const context = await browser.newContext({ baseURL: urls.birdwatchWeb, colorScheme });
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByRole('button', { name: `Log in as ${birders[birder].name}` }).click();
    await expect(page.getByTestId('current-birder')).toContainText(birders[birder].name);
    return new BirdwatchSession(page);
  }

  /** The feed's "Log a sighting" button, shown while `new-sighting-form` serves `true`. */
  get logSighting(): Locator {
    return this.page.getByTestId('log-sighting');
  }

  /** The "Photo ID (beta)" button, shown while `photo-id-beta` serves `true`. */
  get photoId(): Locator {
    return this.page.getByTestId('photo-id');
  }

  /** The rare-bird alert banner, shown while `rare-bird-alerts` serves `true`. */
  get rareBirdAlert(): Locator {
    return this.page.getByTestId('rare-bird-alert');
  }

  /** A flag's row in the flag inspector: every flag Birdwatch got from `allFlags`. */
  inspectedFlag(flagKey: string): Locator {
    return this.page.locator(`[data-testid="inspected-flag"][data-flag="${flagKey}"]`);
  }

  /** Expects the flag inspector to show a flag serving `variation` for `reason`, such as `RULE_MATCH`. */
  async expectInspected(flagKey: string, variation: boolean, reason: EvaluationReason['kind']): Promise<void> {
    const row = this.inspectedFlag(flagKey);
    await expect(row.getByTestId('flag-variation')).toHaveAttribute('data-variation', String(variation), perAttempt);
    await expect(row.getByTestId('flag-reason')).toHaveAttribute('data-reason', reason, perAttempt);
  }

  /**
   * Reloads the feed until `expectation` holds, for at most one Evaluator poll interval (with room for the page
   * load): what a birder sees after a targeting change.
   */
  async expectFeedSoon(expectation: (session: this) => Promise<void>): Promise<void> {
    await reloadUntil(this.page, '/', () => expectation(this), { timeout: withinPollInterval });
  }

  async close(): Promise<void> {
    await this.page.context().close();
  }
}

interface Fixtures {
  /** Logs in to Birdwatch as a birder; the sessions are closed after the test. */
  birdwatch: (birder: BirderId) => Promise<BirdwatchSession>;
  /** Puts the Birdwatch demo back as seeded before and after each test, as each test changes it. */
  demo: void;
}

export const test = base.extend<Fixtures>({
  demo: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixtures destructure what they use.
    async ({}, use) => {
      await resetDemo();
      await use();
      await resetDemo();
    },
    { auto: true },
  ],
  // The sessions' contexts are the fixture's own, so it hands them the test's colorScheme (`test.use`).
  birdwatch: async ({ browser, colorScheme }, use) => {
    const sessions: BirdwatchSession[] = [];
    await use(async (birder) => {
      const session = await BirdwatchSession.logIn(browser, birder, colorScheme);
      sessions.push(session);
      return session;
    });
    await Promise.all(sessions.map((session) => session.close()));
  },
});

export { expect };
