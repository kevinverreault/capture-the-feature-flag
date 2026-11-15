import { expect, type Locator, type Page } from '@playwright/test';
import { environmentKey, environmentName, projectKey } from './demo.js';
import { urls } from './stack.js';

/** The pages of the admin app (served by Core) that the scenarios open, in Birdwatch's project and environment. */
export const adminPages = {
  projects: () => `${urls.core}/projects`,
  dashboard: () => `${urls.core}/projects/${projectKey}?environment=${environmentKey}`,
  newFlag: () => `${urls.core}/projects/${projectKey}/new-flag`,
  /** A flag's page, on the tab of Birdwatch's environment. */
  flag: (flagKey: string) => `${urls.core}/projects/${projectKey}/flags/${flagKey}?environment=${environmentKey}`,
  /** The Contexts explorer, its seen contexts searched by user ID. */
  contexts: (search: string) =>
    `${urls.core}/projects/${projectKey}/contexts?environment=${environmentKey}&search=${encodeURIComponent(search)}`,
};

/** A rule of the targeting editor, as the admin picks it: a country rule here, the only kind the scenarios add. */
export interface CountryRule {
  operator?: 'in' | 'not_in';
  countries: string[];
  /** The variation it serves, as the editor shows it. */
  serve: 'true' | 'false';
}

/** A flag's page in the admin app, on the tab of Birdwatch's environment: its targeting switch and editor. */
export class FlagPage {
  /** The tab of Birdwatch's environment, holding its targeting switch and targeting editor. */
  readonly environment: Locator;

  constructor(
    readonly page: Page,
    readonly flagKey: string,
  ) {
    this.environment = page.getByRole('tabpanel', { name: environmentName });
  }

  async open(): Promise<this> {
    await this.page.goto(adminPages.flag(this.flagKey));
    return this;
  }

  /** The editor's rule at a place in the list, from 1, as its legend numbers it. */
  rule(position: number): Locator {
    return this.environment.getByRole('group', { name: `Rule ${position}` });
  }

  /** Adds a rule at the end of the editor's list (in the page: nothing is saved until {@link saveTargeting}). */
  async addCountryRule(rule: CountryRule): Promise<void> {
    const before = await this.environment.locator('.rule').count();
    await this.environment.getByRole('button', { name: 'Add rule' }).click();
    const added = this.rule(before + 1);
    await added.getByLabel('Attribute').selectOption('country');
    await added.getByLabel('Operator').selectOption(rule.operator ?? 'in');
    await added.getByLabel('Countries').selectOption(rule.countries);
    await added.getByLabel('Serve').selectOption({ label: rule.serve });
  }

  async removeRule(position: number): Promise<void> {
    await this.rule(position).getByRole('button', { name: 'Remove' }).click();
  }

  /** Saves the targeting editor, and waits for the admin app to confirm it. */
  async saveTargeting(): Promise<void> {
    await this.environment.getByRole('button', { name: 'Save targeting' }).click();
    await expect(this.page.getByText(`Targeting saved in ${environmentName}`)).toBeVisible();
  }

  /** Flips the targeting switch from `from` (it saves as soon as it is flipped), and waits for the confirmation. */
  async switchTargeting(from: 'on' | 'off'): Promise<void> {
    const to = from === 'on' ? 'off' : 'on';
    await this.environment.getByRole('switch', { name: `Targeting ${from} in ${environmentName}` }).click();
    await expect(this.page.getByText(`Targeting switched ${to} in ${environmentName}`)).toBeVisible();
    await expect(this.environment.getByRole('switch', { name: `Targeting ${to} in ${environmentName}` })).toBeChecked({
      checked: to === 'on',
    });
  }
}
