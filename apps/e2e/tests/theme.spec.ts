import { expect, test, type Page } from '@playwright/test';
import { adminPages } from '../src/admin.js';
import { BirdwatchSession } from '../src/fixtures.js';
import { urls } from '../src/stack.js';

// The system prefers light, so a page only shows dark when it applies the theme the visitor chose.
const colorScheme = 'light';
test.use({ colorScheme });

async function chooseDarkTheme(page: Page): Promise<void> {
  await expect(page.locator('html')).not.toHaveClass(/\btheme-dark\b/);
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/\btheme-dark\b/);
}

async function expectDarkTheme(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveClass(/\btheme-dark\b/);
  await expect(page.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true');
}

test('the showcase keeps the dark theme from page to page', async ({ page }) => {
  await page.goto(`${urls.showcase}/`);
  await chooseDarkTheme(page);

  await page.goto(`${urls.showcase}/quickstart/`);
  await expectDarkTheme(page);
});

test('the admin app keeps the dark theme from page to page', async ({ page }) => {
  await page.goto(adminPages.projects());
  await chooseDarkTheme(page);

  await page.goto(adminPages.dashboard());
  await expectDarkTheme(page);
});

// Not the `birdwatch` fixture: it resets the demo's targeting, which the theme doesn't depend on.
test('Birdwatch keeps the dark theme from page to page', async ({ browser }) => {
  const session = await BirdwatchSession.logIn(browser, 'alice', { colorScheme });
  try {
    await chooseDarkTheme(session.page);

    await session.page.goto('/species');
    await expectDarkTheme(session.page);
  } finally {
    await session.close();
  }
});
