import { evaluate, type EnvironmentSnapshot } from '@ctff/evaluation';
import type { HTMLElement } from 'node-html-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { browser, page, type Browser } from './support/browser.js';
import { startCore, type RunningCore } from './support/core.js';

type Fields = [string, string][];

/** The targeting editor of one environment's tab. */
function editor(detail: HTMLElement, environmentKey: string): HTMLElement {
  const tab = detail.querySelector(`.tab-panel[data-environment="${environmentKey}"]`);
  const form = tab?.querySelector('form.targeting-editor');
  if (!form) throw new Error(`no targeting editor in the ${environmentKey} tab`);
  return form;
}

/** The value a select shows selected (several for a multi-select). */
function selected(form: HTMLElement, name: string): string[] {
  return form
    .querySelectorAll(`select[name="${name}"] option[selected]`)
    .map((option) => option.getAttribute('value') ?? '');
}

/** The editor's fields for a flag with variations [true, false], before its rules. */
function editorFields(environment: string, version: number, targets: [string, string] = ['', '']): Fields {
  return [
    ['_action', 'edit-targeting'],
    ['environment', environment],
    ['version', String(version)],
    ['target.0', targets[0]],
    ['target.1', targets[1]],
  ];
}

/** A rule's fields, as the editor sends them. */
function ruleFields(id: string, attribute: string, operator: string, values: string[], variation: number): Fields {
  return [
    [`rule.${id}.attribute`, attribute],
    [`rule.${id}.operator`, operator],
    [`rule.${id}.userIds`, attribute === 'user_id' ? values.join('\n') : ''],
    ...(attribute === 'country' ? values.map((value): [string, string] => [`rule.${id}.countries`, value]) : []),
    [`rule.${id}.variation`, String(variation)],
  ];
}

/** The default and off variations, as the editor sends them after its rules. */
function variationFields(defaultVariation: number, offVariation: number): Fields {
  return [
    ['defaultVariation', String(defaultVariation)],
    ['offVariation', String(offVariation)],
  ];
}

describe('admin app: targeting editor', () => {
  let core: RunningCore;
  let admin: Browser;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    admin = browser(core.baseUrl);
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  /** A project with development and production, and the flag rare-bird-alerts; resolves to its pages' paths. */
  async function flag() {
    const projectKey = uniqueKey('targeting');
    await api.post('/projects', { key: projectKey, name: 'Targeting' });
    await api.post(`/projects/${projectKey}/environments`, { key: 'development', name: 'Development' });
    await api.post(`/projects/${projectKey}/environments`, { key: 'production', name: 'Production' });
    await api.post(`/projects/${projectKey}/flags`, { key: 'rare-bird-alerts', name: 'Rare bird alerts' });
    const sdkKey = (await api.get(`/projects/${projectKey}/environments/production`)).body.sdkKey as string;
    return {
      detail: `/projects/${projectKey}/flags/rare-bird-alerts`,
      production: `/projects/${projectKey}/flags/rare-bird-alerts/targeting/production`,
      snapshot: async () =>
        (await api.get<EnvironmentSnapshot>('/evaluator/snapshot', { 'x-ctff-sdk-key': sdkKey })).body,
    };
  }

  it('shows the targeting of each environment in its editor', async () => {
    const { detail, production } = await flag();
    await api.patch(production, {
      version: 1,
      offVariation: 1,
      defaultVariation: 1,
      individualTargets: [{ variation: 0, userIds: ['ada', 'grace'] }],
      rules: [
        { attribute: 'country', operator: 'in', values: ['CA', 'FR'], variation: 0 },
        { attribute: 'user_id', operator: 'not_in', values: ['linus'], variation: 1 },
      ],
    });

    const form = editor(await page(await admin.get(detail)), 'production');
    expect(form.querySelector('input[name="version"]')?.getAttribute('value')).toBe('2');
    expect(form.querySelector('textarea[name="target.0"]')?.textContent).toBe('ada\ngrace');
    expect(form.querySelector('textarea[name="target.1"]')?.textContent).toBe('');
    expect(selected(form, 'rule.0.attribute')).toEqual(['country']);
    expect(selected(form, 'rule.0.countries')).toEqual(['CA', 'FR']);
    expect(selected(form, 'rule.0.variation')).toEqual(['0']);
    expect(selected(form, 'rule.1.attribute')).toEqual(['user_id']);
    expect(selected(form, 'rule.1.operator')).toEqual(['not_in']);
    expect(form.querySelector('textarea[name="rule.1.userIds"]')?.textContent).toBe('linus');
    expect(selected(form, 'defaultVariation')).toEqual(['1']);
    expect(selected(form, 'offVariation')).toEqual(['1']);
    // Countries are picked from the ISO 3166-1 alpha-2 codes only.
    const countries = form.querySelectorAll('select[name="rule.0.countries"] option');
    expect(countries).toHaveLength(249);
    expect(countries.every((option) => /^[A-Z]{2}$/.test(option.getAttribute('value') ?? ''))).toBe(true);

    // Development keeps a new flag's targeting, and offers a blank rule to add one.
    const development = editor(await page(await admin.get(detail)), 'development');
    expect(selected(development, 'defaultVariation')).toEqual(['0']);
    expect(selected(development, 'offVariation')).toEqual(['1']);
    expect(development.querySelectorAll('[data-rule]')).toHaveLength(1);
    expect(development.querySelector('input[name="rule.0.new"]')).not.toBeNull();
    // "Add rule" needs scripts, which show it.
    expect(development.querySelector('[data-add-rule-row]')?.hasAttribute('hidden')).toBe(true);
  });

  it('saves individual targets, rules in order and the variations served, as the SDK sees them', async () => {
    const { detail, production, snapshot } = await flag();
    await api.patch(production, { version: 1, on: true });

    const saved = await admin.post(detail, [
      ...editorFields('production', 2, ['ada\ngrace', 'linus']),
      // Listed out of id order: the order of the form is the order of the rules.
      ...ruleFields('5', 'user_id', 'in', ['margaret'], 1),
      ...ruleFields('2', 'country', 'in', ['ca', 'FR'], 0),
      ...ruleFields('9', 'user_id', 'in', [''], 0),
      ['rule.9.new', '1'],
      ...variationFields(1, 1),
    ]);
    expect(saved.status).toBe(303);
    expect(saved.headers.get('location')).toBe(`${detail}?environment=production`);
    const cookie = saved.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(await (await admin.get(`${detail}?environment=production`, cookie)).text()).toContain(
      'Targeting saved in Production',
    );

    expect((await api.get(production)).body).toMatchObject({
      on: true,
      version: 3,
      offVariation: 1,
      defaultVariation: 1,
      individualTargets: [
        { variation: 0, userIds: ['ada', 'grace'] },
        { variation: 1, userIds: ['linus'] },
      ],
      // The blank rule, left blank, is not saved.
      rules: [
        { attribute: 'user_id', operator: 'in', values: ['margaret'], variation: 1 },
        { attribute: 'country', operator: 'in', values: ['CA', 'FR'], variation: 0 },
      ],
    });
    const served = await snapshot();
    const value = (context: Record<string, string>) => evaluate(served, 'rare-bird-alerts', context).value;
    expect(value({ user_id: 'ada' })).toBe(true);
    expect(value({ user_id: 'linus', country: 'CA' })).toBe(false);
    expect(value({ user_id: 'margaret', country: 'CA' })).toBe(false);
    expect(value({ user_id: 'tim', country: 'CA' })).toBe(true);
    expect(value({ user_id: 'tim', country: 'US' })).toBe(false);

    // Emptied, the individual targets and rules are removed.
    const cleared = await admin.post(detail, [...editorFields('production', 3), ...variationFields(0, 1)]);
    expect(cleared.status).toBe(303);
    expect((await api.get(production)).body).toMatchObject({ individualTargets: [], rules: [], defaultVariation: 0 });
  });

  it('moves and removes rules with their buttons, without scripts, and the order is served', async () => {
    const { detail, production, snapshot } = await flag();
    await api.patch(production, { version: 1, on: true });
    const rules = (): Fields => [
      ...ruleFields('0', 'country', 'in', ['CA'], 0),
      ...ruleFields('1', 'country', 'in', ['CA', 'US'], 1),
      ...ruleFields('2', 'country', 'in', ['MX'], 0),
    ];
    const served = async () => evaluate(await snapshot(), 'rare-bird-alerts', { country: 'CA' }).value;

    const created = await admin.post(detail, [...editorFields('production', 2), ...rules(), ...variationFields(1, 1)]);
    expect(created.status).toBe(303);
    expect(await served()).toBe(true);

    const moved = await admin.post(detail, [
      ...editorFields('production', 3),
      ...rules(),
      ...variationFields(1, 1),
      ['ruleEdit', 'up:1'],
    ]);
    expect(moved.status).toBe(303);
    const after = (await api.get(production)).body;
    expect(after.rules.map((rule: { values: string[] }) => rule.values)).toEqual([['CA', 'US'], ['CA'], ['MX']]);
    expect(await served()).toBe(false);

    const removed = await admin.post(detail, [
      ...editorFields('production', 4),
      ...rules(),
      ...variationFields(1, 1),
      ['ruleEdit', 'remove:0'],
    ]);
    expect(removed.status).toBe(303);
    expect((await api.get(production)).body.rules.map((rule: { values: string[] }) => rule.values)).toEqual([
      ['CA', 'US'],
      ['MX'],
    ]);
  });

  it("shows Core's validation errors next to the rule or individual target, keeping what was submitted", async () => {
    const { detail, production } = await flag();
    const response = await admin.post(detail, [
      ...editorFields('production', 1, ['ada', 'ada']),
      ...ruleFields('3', 'country', 'in', ['ZZ'], 0),
      ...variationFields(0, 1),
    ]);
    expect(response.status).toBe(400);
    const form = editor(await page(response), 'production');
    expect(form.querySelector('[data-target="1"]')?.textContent).toContain(
      'ada is already in the individual target of variation 0',
    );
    expect(form.querySelector('[data-rule="3"]')?.textContent).toContain(
      'ZZ is not an ISO 3166-1 alpha-2 country code',
    );
    expect(form.querySelector('textarea[name="target.0"]')?.textContent).toBe('ada');
    expect(form.querySelector('input[name="version"]')?.getAttribute('value')).toBe('1');
    expect((await api.get(production)).body).toMatchObject({ version: 1, rules: [], individualTargets: [] });

    // An existing rule emptied of its values is refused rather than dropped.
    const emptied = await admin.post(detail, [
      ...editorFields('production', 1),
      ...ruleFields('7', 'user_id', 'in', [], 0),
      ...variationFields(0, 1),
    ]);
    expect(emptied.status).toBe(400);
    const rule = editor(await page(emptied), 'production').querySelector('[data-rule="7"]');
    expect(rule?.querySelector('textarea')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('asks to reload, keeping the draft, when the targeting changed since the page was loaded', async () => {
    const { detail, production } = await flag();
    await api.patch(production, { version: 1, on: true });

    const response = await admin.post(detail, [
      ...editorFields('production', 1, ['ada', '']),
      ...ruleFields('0', 'country', 'not_in', ['FR'], 1),
      ...variationFields(1, 1),
    ]);
    expect(response.status).toBe(409);
    const detailPage = await page(response);
    const tab = detailPage.querySelector('.tab-panel[data-environment="production"]');
    expect(tab?.textContent).toContain('Changed elsewhere — reload');
    // The targeting switch was not the form submitted, so it shows as saved.
    expect(tab?.querySelector('label')?.textContent).not.toContain('(not saved)');
    const form = editor(detailPage, 'production');
    expect(form.querySelector('textarea[name="target.0"]')?.textContent).toBe('ada');
    expect(selected(form, 'rule.0.operator')).toEqual(['not_in']);
    expect(selected(form, 'rule.0.countries')).toEqual(['FR']);
    expect(selected(form, 'defaultVariation')).toEqual(['1']);
    expect(form.querySelector('input[name="version"]')?.getAttribute('value')).toBe('1');
    expect(detailPage.querySelector('flag-tabs')?.getAttribute('data-selected')).toBe('production');
    expect((await api.get(production)).body).toMatchObject({ version: 2, rules: [], individualTargets: [] });
  });
});
