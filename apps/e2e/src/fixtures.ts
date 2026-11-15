import { test as base, expect, type Browser, type Locator, type Page } from '@playwright/test';
import type { EvaluationReason } from '@ctff/core-api-client';
import { birders, resetDemo, type BirderId } from './demo.js';
import { urls, withinPollInterval } from './stack.js';

/**
 * For the expectations retried by `toPass`, such as in {@link BirdwatchSession.expectFeedSoon}: each checks the
 * page as it is, and the retry waits. (A timeout of 0 would wait forever.)
 */
export const now = { timeout: 500 };

/** Birdwatch's website, logged in as one birder in a browser context of their own. */
export class BirdwatchSession {
  constructor(readonly page: Page) {}

  static async logIn(browser: Browser, birder: BirderId): Promise<BirdwatchSession> {
    const context = await browser.newContext({ baseURL: urls.birdwatchWeb });
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
    await expect(row.getByTestId('flag-variation')).toHaveAttribute('data-variation', String(variation), now);
    await expect(row.getByTestId('flag-reason')).toHaveAttribute('data-reason', reason, now);
  }

  /**
   * Reloads the feed until `expectation` holds, for at most one Evaluator poll interval (with room for the page
   * load): what a birder sees after a targeting change.
   */
  async expectFeedSoon(expectation: (session: this) => Promise<void>): Promise<void> {
    await expect(async () => {
      await this.page.goto('/');
      await expectation(this);
    }).toPass({ timeout: withinPollInterval, intervals: [250] });
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
  birdwatch: async ({ browser }, use) => {
    const sessions: BirdwatchSession[] = [];
    await use(async (birder) => {
      const session = await BirdwatchSession.logIn(browser, birder);
      sessions.push(session);
      return session;
    });
    await Promise.all(sessions.map((session) => session.close()));
  },
});

export { expect };

/** A page of the admin app, served by Core. */
export const adminUrl = (path: string) => `${urls.core}${path}`;
