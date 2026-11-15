import { adminPages } from '../src/admin.js';
import { createFlag, seededTargeting } from '../src/demo.js';
import { expect, perAttempt, reloadUntil, test } from '../src/fixtures.js';
import { withinTelemetryFlush } from '../src/stack.js';

/** How far the Evaluator's clock, which stamps when a context was last seen, may be behind the suite's. */
const clockSkewMs = 2000;

test('after some Birdwatch traffic, the dashboard shows evaluations and the Contexts explorer lists the birder', async ({
  page,
  birdwatch,
}) => {
  // Two waits on telemetry, which may each take a whole flush interval on a stack without compose.e2e.yaml.
  test.setTimeout(2 * withinTelemetryFlush + 30_000);
  const startedAt = Date.now();

  // A flag nothing has evaluated yet: only the traffic below counts evaluations of it, unlike the demo's flags,
  // whose counts from earlier scenarios may still be on their way to Core.
  const flagKey = await createFlag('Telemetry probe');

  // Dev (CA) browses Birdwatch: each page evaluates every flag for dev in CA, the new one included.
  const dev = await birdwatch('dev');
  await dev.expectFeedSoon((feed) => feed.expectInspected(flagKey, false, 'OFF'));
  for (const path of ['/species', '/']) await dev.page.goto(path);

  // The Evaluator sends its counts to Core with its telemetry, and the dashboard sums them, per flag too.
  const perFlag = page.getByRole('figure', { name: /Evaluations per flag/ });
  await reloadUntil(
    page,
    adminPages.dashboard(),
    () => expect(perFlag.locator(`li[data-flag="${flagKey}"]`)).toBeVisible(perAttempt),
    { timeout: withinTelemetryFlush, interval: 1000 },
  );
  expect(Number(await page.locator('.hero[data-total]').getAttribute('data-total'))).toBeGreaterThan(0);
  for (const seeded of Object.keys(seededTargeting)) {
    await expect(perFlag.locator(`li[data-flag="${seeded}"]`)).toBeVisible();
  }
  await expect(page.getByRole('figure', { name: /Evaluations over the last 24 hours/ })).toBeVisible();

  // The Contexts explorer lists dev in CA among the seen contexts, as last seen by this test's traffic.
  const seen = page.getByRole('link', { name: 'See what dev in CA is served' });
  await reloadUntil(
    page,
    adminPages.contexts('dev'),
    async () => {
      const lastSeen = await page
        .getByRole('row')
        .filter({ has: seen })
        .locator('time')
        .getAttribute('datetime', perAttempt);
      expect(Date.parse(lastSeen ?? '')).toBeGreaterThanOrEqual(startedAt - clockSkewMs);
    },
    { timeout: withinTelemetryFlush, interval: 1000 },
  );

  // Picking it shows what each flag serves dev in CA now.
  await seen.click();
  await expect(page.getByRole('heading', { name: 'What dev in CA is served in Development' })).toBeVisible();
  const served = page.locator('table.context-flags');
  await expect(served.locator('tr[data-flag="new-sighting-form"]')).toContainText(/true\s*Default variation/);
  await expect(served.locator('tr[data-flag="rare-bird-alerts"]')).toContainText(/true\s*Rule 1 matched/);
  await expect(served.locator('tr[data-flag="photo-id-beta"]')).toContainText(/false\s*Default variation/);
  await expect(served.locator(`tr[data-flag="${flagKey}"]`)).toContainText(/false\s*Targeting off/);
});
