import type { Page } from '@playwright/test';
import { adminUrl, expect, now, test } from '../src/fixtures.js';
import { withinTelemetryFlush } from '../src/stack.js';

const dashboard = adminUrl('/projects/birdwatch?environment=development');

/** The evaluations the dashboard counts in Development over the last 24 hours. */
async function evaluationsShown(page: Page): Promise<number> {
  return Number(await page.locator('.hero[data-total]').getAttribute('data-total', now));
}

test('after some Birdwatch traffic, the dashboard shows evaluations and the Contexts explorer lists the birder', async ({
  page,
  birdwatch,
}) => {
  await page.goto(dashboard);
  const before = await evaluationsShown(page);

  // Dev (CA) browses Birdwatch: each page evaluates every flag for dev in CA.
  const dev = await birdwatch('dev');
  for (const path of ['/', '/species', '/']) await dev.page.goto(path);
  await dev.expectInspected('rare-bird-alerts', true, 'RULE_MATCH');

  // The Evaluator sends its counts to Core with its telemetry, and the dashboard sums them.
  await expect(async () => {
    await page.goto(dashboard);
    expect(await evaluationsShown(page)).toBeGreaterThan(before);
  }).toPass({ timeout: withinTelemetryFlush, intervals: [1000] });
  const perFlag = page.getByRole('figure', { name: /Evaluations per flag/ });
  for (const flagKey of ['new-sighting-form', 'rare-bird-alerts', 'photo-id-beta']) {
    await expect(perFlag.locator(`li[data-flag="${flagKey}"]`)).toBeVisible();
  }
  await expect(page.getByRole('figure', { name: /Evaluations over the last 24 hours/ })).toBeVisible();

  // The Contexts explorer lists dev in CA among the seen contexts, and shows what each flag serves it.
  const contexts = adminUrl('/projects/birdwatch/contexts?environment=development&search=dev');
  const seen = page.getByRole('link', { name: 'See what dev in CA is served' });
  await expect(async () => {
    await page.goto(contexts);
    await expect(seen).toBeVisible(now);
  }).toPass({ timeout: withinTelemetryFlush, intervals: [1000] });
  await seen.click();
  await expect(page.getByRole('heading', { name: 'What dev in CA is served in Development' })).toBeVisible();
  const served = page.locator('table.context-flags');
  await expect(served.locator('tr[data-flag="new-sighting-form"]')).toContainText(/true\s*Default variation/);
  await expect(served.locator('tr[data-flag="rare-bird-alerts"]')).toContainText(/true\s*Rule 1 matched/);
  await expect(served.locator('tr[data-flag="photo-id-beta"]')).toContainText(/false\s*Default variation/);
});
