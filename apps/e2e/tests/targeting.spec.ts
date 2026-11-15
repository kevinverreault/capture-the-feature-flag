import { adminPages, FlagPage } from '../src/admin.js';
import { createdFlagPrefix, falseVariation } from '../src/demo.js';
import { expect, perAttempt, test } from '../src/fixtures.js';

test('a country rule added in the targeting editor changes what a CA birder and an NL birder see', async ({
  page,
  birdwatch,
}) => {
  // As seeded, rare-bird-alerts has one rule, country in [CA]: Alice (CA) gets the banner, Bram (NL) doesn't.
  const alice = await birdwatch('alice');
  const bram = await birdwatch('bram');
  await alice.expectFeedSoon(async (feed) => {
    await expect(feed.rareBirdAlert).toBeVisible(perAttempt);
    await feed.expectInspected('rare-bird-alerts', true, 'RULE_MATCH');
  });
  await bram.expectFeedSoon(async (feed) => {
    await expect(feed.rareBirdAlert).toBeHidden(perAttempt);
    await feed.expectInspected('rare-bird-alerts', false, 'DEFAULT');
  });

  // The alerts move from Canada to the Netherlands: the CA rule is removed, and a country in [NL] rule added.
  const flag = await new FlagPage(page, 'rare-bird-alerts').open();
  await flag.removeRule(1);
  await flag.addCountryRule({ countries: ['NL'], serve: 'true' });
  await flag.saveTargeting();

  // Bram now matches the rule and gets the banner; Alice gets the default variation, false, and loses it.
  await bram.expectFeedSoon(async (feed) => {
    await expect(feed.rareBirdAlert).toBeVisible(perAttempt);
    await feed.expectInspected('rare-bird-alerts', true, 'RULE_MATCH');
  });
  await expect(bram.inspectedFlag('rare-bird-alerts')).toContainText('RULE_MATCH (rule 1)');
  await alice.expectFeedSoon(async (feed) => {
    await expect(feed.rareBirdAlert).toBeHidden(perAttempt);
    await feed.expectInspected('rare-bird-alerts', false, 'DEFAULT');
  });
});

test('a flag created in the admin app is served to Birdwatch, to the birder and the country it targets', async ({
  page,
  birdwatch,
}) => {
  const flagKey = `${createdFlagPrefix}${Date.now().toString(36)}`;
  await page.goto(adminPages.newFlag());
  await page.getByLabel('Key').fill(flagKey);
  await page.getByLabel('Name').fill('End-to-end flag');
  await page.getByRole('button', { name: 'Create flag' }).click();
  await expect(page.getByText('Flag End-to-end flag created')).toBeVisible();

  // A new flag starts with its targeting off: every birder gets its off variation, false.
  const alice = await birdwatch('alice');
  const bram = await birdwatch('bram');
  const chiara = await birdwatch('chiara');
  await bram.expectFeedSoon((feed) => feed.expectInspected(flagKey, false, 'OFF'));

  // Bram is targeted individually and CA by a rule, both with true; everyone else gets the default variation, false.
  const flag = await new FlagPage(page, flagKey).open();
  await flag.environment.getByLabel('User IDs served true').fill('bram');
  await flag.addCountryRule({ countries: ['CA'], serve: 'true' });
  await flag.environment.getByLabel('Default variation').selectOption(String(falseVariation));
  await flag.saveTargeting();
  await flag.switchTargeting('off');

  await bram.expectFeedSoon((feed) => feed.expectInspected(flagKey, true, 'TARGET_MATCH'));
  await alice.expectFeedSoon((feed) => feed.expectInspected(flagKey, true, 'RULE_MATCH'));
  await chiara.expectFeedSoon((feed) => feed.expectInspected(flagKey, false, 'DEFAULT'));
});
