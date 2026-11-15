import { createdFlagPrefix, falseVariation } from '../src/demo.js';
import { adminUrl, expect, now, test } from '../src/fixtures.js';

test('a country rule added in the targeting editor changes what a CA birder and an NL birder see', async ({
  page,
  birdwatch,
}) => {
  // As seeded, rare-bird-alerts has one rule, country in [CA]: Alice (CA) gets the banner, Bram (NL) doesn't.
  const alice = await birdwatch('alice');
  const bram = await birdwatch('bram');
  await alice.expectFeedSoon(async (feed) => {
    await expect(feed.rareBirdAlert).toBeVisible(now);
    await feed.expectInspected('rare-bird-alerts', true, 'RULE_MATCH');
  });
  await bram.expectFeedSoon(async (feed) => {
    await expect(feed.rareBirdAlert).toBeHidden(now);
    await feed.expectInspected('rare-bird-alerts', false, 'DEFAULT');
  });

  // The alerts move from Canada to the Netherlands: the CA rule is removed, and a country in [NL] rule added.
  await page.goto(adminUrl('/projects/birdwatch/flags/rare-bird-alerts?environment=development'));
  const development = page.getByRole('tabpanel', { name: 'Development' });
  await development.getByRole('group', { name: 'Rule 1' }).getByRole('button', { name: 'Remove' }).click();
  await development.getByRole('button', { name: 'Add rule' }).click();
  const rule = development.getByRole('group', { name: 'Rule 1' });
  await rule.getByLabel('Attribute').selectOption('country');
  await rule.getByLabel('Operator').selectOption('in');
  await rule.getByLabel('Countries').selectOption(['NL']);
  await rule.getByLabel('Serve').selectOption({ label: 'true' });
  await development.getByRole('button', { name: 'Save targeting' }).click();
  await expect(page.getByText('Targeting saved in Development')).toBeVisible();

  // Bram now matches the rule and gets the banner; Alice gets the default variation, false, and loses it.
  await bram.expectFeedSoon(async (feed) => {
    await expect(feed.rareBirdAlert).toBeVisible(now);
    await feed.expectInspected('rare-bird-alerts', true, 'RULE_MATCH');
  });
  await expect(bram.inspectedFlag('rare-bird-alerts')).toContainText('RULE_MATCH (rule 1)');
  await alice.expectFeedSoon(async (feed) => {
    await expect(feed.rareBirdAlert).toBeHidden(now);
    await feed.expectInspected('rare-bird-alerts', false, 'DEFAULT');
  });
});

test('a flag created in the admin app is served to Birdwatch, to the birder and the country it targets', async ({
  page,
  birdwatch,
}) => {
  const flagKey = `${createdFlagPrefix}${Date.now().toString(36)}`;
  await page.goto(adminUrl('/projects/birdwatch/new-flag'));
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
  await page.goto(adminUrl(`/projects/birdwatch/flags/${flagKey}?environment=development`));
  const development = page.getByRole('tabpanel', { name: 'Development' });
  await development.getByLabel('User IDs served true').fill('bram');
  await development.getByRole('button', { name: 'Add rule' }).click();
  const rule = development.getByRole('group', { name: 'Rule 1' });
  await rule.getByLabel('Attribute').selectOption('country');
  await rule.getByLabel('Countries').selectOption(['CA']);
  await rule.getByLabel('Serve').selectOption({ label: 'true' });
  await development.getByLabel('Default variation').selectOption(String(falseVariation));
  await development.getByRole('button', { name: 'Save targeting' }).click();
  await expect(page.getByText('Targeting saved in Development')).toBeVisible();
  await development.getByRole('switch', { name: 'Targeting off in Development' }).click();
  await expect(page.getByText('Targeting switched on in Development')).toBeVisible();

  await bram.expectFeedSoon((feed) => feed.expectInspected(flagKey, true, 'TARGET_MATCH'));
  await alice.expectFeedSoon((feed) => feed.expectInspected(flagKey, true, 'RULE_MATCH'));
  await chiara.expectFeedSoon((feed) => feed.expectInspected(flagKey, false, 'DEFAULT'));
});
