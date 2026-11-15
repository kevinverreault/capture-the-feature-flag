import { expect, test } from '@playwright/test';
import { urls } from '../src/stack.js';

/** The showcase's pages (apps/showcase/src/lib/site.ts). */
const pages = ['/', '/how-it-works/', '/quickstart/', '/guides/sdk/', '/guides/terraform/', '/roadmap/'];

test.describe('the showcase', () => {
  test.use({ baseURL: urls.showcase });

  for (const path of pages) {
    test(`${path} loads without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console error: ${message.text()}`);
      });
      page.on('requestfailed', (request) => errors.push(`failed: ${request.url()} (${request.failure()?.errorText})`));
      page.on('response', (response) => {
        if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
      });

      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(/Capture The Feature Flag/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // Requests started after the load event (lazy images, scripts' own fetches) can fail too: the static pages
      // go quiet once they are done, so the errors are checked after that.
      await page.waitForLoadState('networkidle');
      expect(errors).toEqual([]);

      // Every link to another page of the showcase leads to one of its pages.
      const hrefs = await page
        .locator('a[href]')
        .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
      const showcaseOrigin = new URL(urls.showcase).origin;
      const linked = new Set(
        hrefs
          .map((href) => new URL(href))
          .filter((url) => url.origin === showcaseOrigin)
          .map((url) => url.pathname),
      );
      for (const pathname of linked) expect(pages, `the link to ${pathname}`).toContain(pathname);
    });
  }

  test('the navigation lists every page', async ({ page }) => {
    await page.goto('/');
    const listed = await page
      .getByRole('navigation')
      .first()
      .locator('a[href]')
      .evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname));
    expect(new Set(listed)).toEqual(new Set(pages));
  });
});
