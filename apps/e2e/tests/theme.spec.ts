import type { Page } from '@playwright/test';
import { adminPages } from '../src/admin.js';
import { expect, test } from '../src/fixtures.js';
import { urls } from '../src/stack.js';

/** The system prefers light, so a page only shows dark when it applies the theme the visitor chose. */
test.use({ colorScheme: 'light' });

/** The class the design system's theme puts on `<html>` while the dark theme is on. */
const darkTheme = /\btheme-dark\b/;

/** The design system's `ThemeToggle`, which every app renders in its header. */
const themeToggle = (page: Page) => page.getByRole('button', { name: 'Dark theme' });

/** Turns the dark theme on with the toggle, on a page that shows the light theme. */
async function chooseDarkTheme(page: Page): Promise<void> {
  const html = page.locator('html');
  await expect(html).not.toHaveClass(darkTheme);
  await themeToggle(page).click();
  await expect(html).toHaveClass(darkTheme);
}

/** Expects the page to have loaded in the dark theme, its toggle pressed. */
async function expectDarkTheme(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveClass(darkTheme);
  await expect(themeToggle(page)).toHaveAttribute('aria-pressed', 'true');
}

/** The apps whose pages anyone can open: the page where the dark theme is chosen, and the next one. */
const apps = [
  { name: 'the showcase', from: `${urls.showcase}/`, to: `${urls.showcase}/quickstart/` },
  { name: 'the admin app', from: adminPages.projects(), to: adminPages.dashboard() },
];

for (const app of apps) {
  test(`${app.name} keeps the dark theme from page to page`, async ({ page }) => {
    await page.goto(app.from);
    await chooseDarkTheme(page);

    await page.goto(app.to);
    await expectDarkTheme(page);
  });
}

test('Birdwatch keeps the dark theme from page to page', async ({ birdwatch }) => {
  const { page } = await birdwatch('alice');
  await chooseDarkTheme(page);

  await page.goto('/species');
  await expectDarkTheme(page);
});
