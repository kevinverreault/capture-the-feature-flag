import { adminUrl, expect, now, test } from '../src/fixtures.js';

test('archiving a flag makes Birdwatch use its fallback value', async ({ page, birdwatch }) => {
  // photo-id-beta targets Chiara individually: she gets "Photo ID (beta)".
  const chiara = await birdwatch('chiara');
  await chiara.expectFeedSoon(async (feed) => {
    await expect(feed.photoId).toBeVisible(now);
    await feed.expectInspected('photo-id-beta', true, 'TARGET_MATCH');
  });

  await page.goto(adminUrl('/projects/birdwatch/flags/photo-id-beta'));
  await page.getByRole('button', { name: 'Archive flag' }).click();
  await expect(page.getByText('Flag photo-id-beta archived')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This flag is archived' })).toBeVisible();

  // An archived flag is no longer served: the Evaluator leaves it out of allFlags, so Birdwatch falls back to
  // false, its fallback value, and Chiara loses "Photo ID (beta)" and its page.
  await chiara.expectFeedSoon(async (feed) => {
    await expect(feed.photoId).toBeHidden(now);
    await expect(feed.inspectedFlag('photo-id-beta')).toHaveCount(0, now);
  });
  await chiara.expectInspected('new-sighting-form', true, 'DEFAULT');
  expect((await chiara.page.goto('/photo-id'))?.status()).toBe(404);
});
