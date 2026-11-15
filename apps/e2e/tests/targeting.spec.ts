import { createdFlagPrefix, falseVariation, setTargeting, seededTargeting } from '../src/demo.js';
import { adminUrl, expect, now, test } from '../src/fixtures.js';

test('a country rule added in the targeting editor changes what a CA birder and an NL birder see', async ({
  page,
  birdwatch,
}) => {
  // rare-bird-alerts without its seeded rule: everyone gets the default variation, false.
  await setTargeting('rare-bird-alerts', { ...seededTargeting['rare-bird-alerts'], rules: [] });
  const alice = await birdwatch('alice');
  const bram = await birdwatch('bram');
  for (const birder of [alice, bram]) {
    await birder.expectFeedSoon(async (feed) => {
      await expect(feed.rareBirdAlert).toBeHidden(now);
      await feed.expectInspected('rare-bird-alerts', false, 'DEFAULT');
    });
  }

  await page.goto(adminUrl('/projects/birdwatch/flags/rare-bird-alerts?environment=development'));
  const development = page.getByRole('tabpanel', { name: 'Development' });
  await development.getByRole('button', { name: 'Add rule' }).click();
  const rule = development.locator('.rule').last();
  await expect(rule.getByRole('group', { name: 'Rule 1' })).toBeVisible();
  await rule.getByLabel('Attribute').selectOption('country');
  await rule.getByLabel('Operator').selectOption('in');
  await rule.getByLabel('Countries').selectOption(['NL']);
  await rule.getByLabel('Serve').selectOption({ label: 'true' });
  await development.getByRole('button', { name: 'Save targeting' }).click();
  await expect(page.getByText('Targeting saved in Development')).toBeVisible();

  // Bram, in NL, now matches the rule and gets the banner; Alice, in CA, still gets the default variation.
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

test('a flag created in the admin app is served to Birdwatch, to the birder it targets', async ({
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
  await bram.expectFeedSoon((feed) => feed.expectInspected(flagKey, false, 'OFF'));

  // Bram is targeted individually with true, everyone else gets the default variation, false.
  await page.goto(adminUrl(`/projects/birdwatch/flags/${flagKey}?environment=development`));
  const development = page.getByRole('tabpanel', { name: 'Development' });
  await development.getByLabel('User IDs served true').fill('bram');
  await development.getByLabel('Default variation').selectOption(String(falseVariation));
  await development.getByRole('button', { name: 'Save targeting' }).click();
  await expect(page.getByText('Targeting saved in Development')).toBeVisible();
  await page
    .getByRole('tabpanel', { name: 'Development' })
    .getByRole('switch', { name: 'Targeting off in Development' })
    .click();
  await expect(page.getByText('Targeting switched on in Development')).toBeVisible();

  await bram.expectFeedSoon((feed) => feed.expectInspected(flagKey, true, 'TARGET_MATCH'));
  await alice.expectFeedSoon((feed) => feed.expectInspected(flagKey, false, 'DEFAULT'));
});
