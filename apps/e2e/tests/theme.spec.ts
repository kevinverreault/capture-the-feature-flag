import type { Page } from '@playwright/test';
import { adminPages } from '../src/admin.js';
import { expect, test, type Fixtures } from '../src/fixtures.js';
import { urls } from '../src/stack.js';

/** The system prefers light unless a scenario says otherwise. While the system prefers light, a page shows dark only for a theme the visitor chose. */
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

/** The fixtures an app's first page opens with. */
type AppFixtures = { page: Page } & Pick<Fixtures, 'birdwatch'>;

/** Each app: how a visitor opens its first page, and the next page they go to. */
const apps: { name: string; first: (fixtures: AppFixtures) => Promise<Page>; next: string }[] = [
  {
    name: 'the showcase',
    first: async ({ page }) => (await page.goto(`${urls.showcase}/`), page),
    next: `${urls.showcase}/quickstart/`,
  },
  {
    name: 'the admin app',
    first: async ({ page }) => (await page.goto(adminPages.projects()), page),
    next: adminPages.dashboard(),
  },
  {
    name: 'Birdwatch',
    first: async ({ birdwatch }) => (await birdwatch('alice')).page,
    next: '/species',
  },
];

for (const app of apps) {
  test(`${app.name} keeps the dark theme from page to page`, async ({ page, birdwatch }) => {
    const first = await app.first({ page, birdwatch });
    await chooseDarkTheme(first);

    await first.goto(app.next);
    await expectDarkTheme(first);
  });
}

test.describe('while the system prefers dark', () => {
  test.use({ colorScheme: 'dark' });

  for (const app of apps) {
    test(`${app.name} shows the dark theme without the toggle`, async ({ page, birdwatch }) => {
      const first = await app.first({ page, birdwatch });
      await expectDarkTheme(first);

      await first.goto(app.next);
      await expectDarkTheme(first);
    });
  }
});
