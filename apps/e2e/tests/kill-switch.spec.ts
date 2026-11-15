import { FlagPage } from '../src/admin.js';
import { expect, perAttempt, test } from '../src/fixtures.js';

test('switching the targeting of new-sighting-form off in the admin app hides the form in Birdwatch within the poll interval', async ({
  page,
  birdwatch,
}) => {
  const alice = await birdwatch('alice');
  await alice.expectFeedSoon(async ({ logSighting }) => expect(logSighting).toBeVisible(perAttempt));

  await (await new FlagPage(page, 'new-sighting-form').open()).switchTargeting('on');

  // With its targeting off, the flag serves its off variation, false, and the feed no longer offers the form.
  await alice.expectFeedSoon(async (feed) => {
    await expect(feed.logSighting).toBeHidden(perAttempt);
    await feed.expectInspected('new-sighting-form', false, 'OFF');
  });
  // The form's own page says it is switched off.
  expect((await alice.page.goto('/sightings/new'))?.status()).toBe(404);
});
