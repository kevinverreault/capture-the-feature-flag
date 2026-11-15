import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

/** Targeting off, off variation `false` (index 1) and default variation `true` (index 0). */
const offState = {
  on: false,
  offVariation: 1,
  defaultVariation: 0,
  individualTargets: [],
  rules: [],
  version: 1,
};

describe('targeting', () => {
  let core: RunningCore;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  async function project(...environmentKeys: string[]): Promise<string> {
    const key = uniqueKey('project');
    await api.post('/projects', { key, name: 'Project' });
    for (const environmentKey of environmentKeys) {
      await api.post(`/projects/${key}/environments`, { key: environmentKey, name: environmentKey });
    }
    return key;
  }

  it('gives a new flag off-state targeting in every environment', async () => {
    const projectKey = await project('development', 'production');
    await api.post(`/projects/${projectKey}/flags`, { key: 'new-sighting-form', name: 'New sighting form' });

    const targeting = await api.get(`/projects/${projectKey}/flags/new-sighting-form/targeting`);
    expect(targeting.status).toBe(200);
    expect(targeting.body).toEqual([
      expect.objectContaining({ environmentKey: 'development', flagKey: 'new-sighting-form', ...offState }),
      expect.objectContaining({ environmentKey: 'production', flagKey: 'new-sighting-form', ...offState }),
    ]);
  });

  it('gives a new environment off-state targeting for every existing flag', async () => {
    const projectKey = await project('development');
    await api.post(`/projects/${projectKey}/flags`, { key: 'first-flag', name: 'First' });
    await api.post(`/projects/${projectKey}/flags`, { key: 'second-flag', name: 'Second' });
    await api.patch(`/projects/${projectKey}/flags/first-flag/targeting/development`, { version: 1, on: true });

    await api.post(`/projects/${projectKey}/environments`, { key: 'production', name: 'Production' });

    for (const flagKey of ['first-flag', 'second-flag']) {
      const targeting = await api.get(`/projects/${projectKey}/flags/${flagKey}/targeting/production`);
      expect(targeting.status).toBe(200);
      expect(targeting.body).toMatchObject({ environmentKey: 'production', flagKey, ...offState });
    }
  });

  it('never fails when flags are created while environments are deleted', async () => {
    const projectKey = await project();
    const environmentKeys = Array.from({ length: 15 }, (_, index) => `env-${index}`);
    for (const key of environmentKeys) {
      await api.post(`/projects/${projectKey}/environments`, { key, name: key });
    }

    const statuses = await Promise.all(
      environmentKeys
        .flatMap((key, index) => [
          api.post(`/projects/${projectKey}/flags`, { key: `flag-${index}`, name: `Flag ${index}` }),
          api.delete(`/projects/${projectKey}/environments/${key}`),
        ])
        .map(async (response) => (await response).status),
    );
    expect(statuses.filter((status) => status >= 300)).toEqual([]);
  });

  it('switches targeting on and off in one environment only', async () => {
    const projectKey = await project('development', 'production');
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'Kill switch' });
    const production = `/projects/${projectKey}/flags/kill-switch/targeting/production`;

    const on = await api.patch(production, { version: 1, on: true });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ on: true, version: 2 });
    expect((await api.get(production)).body).toMatchObject({ on: true, version: 2 });
    expect((await api.get(`/projects/${projectKey}/flags/kill-switch/targeting/development`)).body).toMatchObject(
      offState,
    );

    const off = await api.patch(production, { version: 2, on: false });
    expect(off.body).toMatchObject({ on: false, version: 3 });
  });

  it('rejects a targeting change based on an outdated version with 409', async () => {
    const projectKey = await project('production');
    await api.post(`/projects/${projectKey}/flags`, { key: 'contended', name: 'Contended' });
    const production = `/projects/${projectKey}/flags/contended/targeting/production`;
    await api.patch(production, { version: 1, on: true });

    expect((await api.patch(production, { version: 1, on: false })).status).toBe(409);
    expect((await api.get(production)).body).toMatchObject({ on: true, version: 2 });
  });

  it('validates a targeting change', async () => {
    const projectKey = await project('production');
    await api.post(`/projects/${projectKey}/flags`, { key: 'validated', name: 'Validated' });
    const production = `/projects/${projectKey}/flags/validated/targeting/production`;

    expect((await api.patch(production, { on: true })).status).toBe(400);
    expect((await api.patch(production, { version: 1, on: 'yes' })).status).toBe(400);
    expect((await api.patch(production, { version: 1, on: null })).status).toBe(400);
  });

  it('sets and reads individual targets, ordered rules, the default variation and the off variation', async () => {
    const projectKey = await project('development', 'production');
    await api.post(`/projects/${projectKey}/flags`, { key: 'rare-bird-alerts', name: 'Rare bird alerts' });
    const production = `/projects/${projectKey}/flags/rare-bird-alerts/targeting/production`;

    const full = {
      on: true,
      offVariation: 0,
      defaultVariation: 1,
      individualTargets: [
        { variation: 0, userIds: ['alice', 'bob'] },
        { variation: 1, userIds: ['carol'] },
      ],
      rules: [
        { attribute: 'country', operator: 'in', values: ['CA', 'US'], variation: 0 },
        { attribute: 'user_id', operator: 'not_in', values: ['dave'], variation: 1 },
      ],
    };
    const updated = await api.patch(production, { version: 1, ...full });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ ...full, version: 2 });
    expect((await api.get(production)).body).toMatchObject({ ...full, version: 2 });
    expect((await api.get(`/projects/${projectKey}/flags/rare-bird-alerts/targeting/development`)).body).toMatchObject(
      offState,
    );

    // Leaving a property out keeps it; sending a list replaces it.
    const reordered = await api.patch(production, { version: 2, rules: [...full.rules].reverse() });
    expect(reordered.body).toMatchObject({ ...full, rules: [...full.rules].reverse(), version: 3 });
    const cleared = await api.patch(production, { version: 3, individualTargets: [], rules: [] });
    expect((await api.get(production)).body).toMatchObject({
      ...full,
      individualTargets: [],
      rules: [],
      version: 4,
    });
    expect(cleared.status).toBe(200);
  });

  it('stores country rule values in uppercase', async () => {
    const projectKey = await project('production');
    await api.post(`/projects/${projectKey}/flags`, { key: 'countries', name: 'Countries' });
    const production = `/projects/${projectKey}/flags/countries/targeting/production`;

    const response = await api.patch(production, {
      version: 1,
      rules: [{ attribute: 'country', operator: 'in', values: ['ca', 'Nl'], variation: 0 }],
    });
    expect(response.status).toBe(200);
    expect((await api.get(production)).body.rules).toEqual([
      { attribute: 'country', operator: 'in', values: ['CA', 'NL'], variation: 0 },
    ]);
  });

  it('checks the version of a full targeting change too', async () => {
    const projectKey = await project('production');
    await api.post(`/projects/${projectKey}/flags`, { key: 'raced', name: 'Raced' });
    const production = `/projects/${projectKey}/flags/raced/targeting/production`;
    await api.patch(production, { version: 1, defaultVariation: 1 });

    const stale = await api.patch(production, {
      version: 1,
      rules: [{ attribute: 'country', operator: 'in', values: ['CA'], variation: 0 }],
    });
    expect(stale.status).toBe(409);
    expect((await api.get(production)).body).toMatchObject({ defaultVariation: 1, rules: [], version: 2 });
  });

  describe('rejects invalid targeting with a clear validation error', () => {
    const rule = { attribute: 'country', operator: 'in', values: ['CA'], variation: 0 };
    it.each<[string, Record<string, unknown>, Record<string, string[]>]>([
      [
        'an unknown country code',
        { rules: [rule, { ...rule, values: ['CA', 'XX'] }] },
        { 'rules.1.values': ['XX is not an ISO 3166-1 alpha-2 country code'] },
      ],
      [
        'a country code that is not two letters',
        { rules: [{ ...rule, values: ['CAN'] }] },
        { 'rules.0.values': ['CAN is not an ISO 3166-1 alpha-2 country code'] },
      ],
      [
        'an empty user ID in a rule',
        { rules: [{ ...rule, attribute: 'user_id', values: ['alice', ''] }] },
        { 'rules.0.values': ['user IDs must be non-empty strings'] },
      ],
      [
        'an empty user ID in an individual target',
        { individualTargets: [{ variation: 0, userIds: [''] }] },
        { 'individualTargets.0.userIds': ['user IDs must be non-empty strings'] },
      ],
      [
        'an unknown off variation',
        { offVariation: 2 },
        { offVariation: ['variation 2 does not exist; the flag has variations 0 to 1'] },
      ],
      [
        'an unknown default variation',
        { defaultVariation: 5 },
        { defaultVariation: ['variation 5 does not exist; the flag has variations 0 to 1'] },
      ],
      [
        'an unknown variation in a rule',
        { rules: [{ ...rule, variation: 2 }] },
        { 'rules.0.variation': ['variation 2 does not exist; the flag has variations 0 to 1'] },
      ],
      [
        'an unknown variation in an individual target',
        { individualTargets: [{ variation: 3, userIds: ['alice'] }] },
        { 'individualTargets.0.variation': ['variation 3 does not exist; the flag has variations 0 to 1'] },
      ],
      [
        'two individual targets for one variation',
        {
          individualTargets: [
            { variation: 0, userIds: ['alice'] },
            { variation: 0, userIds: ['bob'] },
          ],
        },
        { 'individualTargets.1.variation': ['variation 0 already has an individual target'] },
      ],
      [
        'a user ID in two individual targets',
        {
          individualTargets: [
            { variation: 0, userIds: ['alice'] },
            { variation: 1, userIds: ['bob', 'alice'] },
          ],
        },
        { 'individualTargets.1.userIds': ['alice is already in the individual target of variation 0'] },
      ],
    ])('%s', async (_case, change, fields) => {
      const projectKey = await project('production');
      await api.post(`/projects/${projectKey}/flags`, { key: 'invalid', name: 'Invalid' });
      const production = `/projects/${projectKey}/flags/invalid/targeting/production`;

      const response = await api.patch(production, { version: 1, ...change });
      expect(response.status).toBe(400);
      expect(response.body.fields).toEqual(fields);
      expect((await api.get(production)).body).toMatchObject(offState);
    });

    it.each<[string, Record<string, unknown>, string]>([
      ['a rule on an unknown attribute', { rules: [{ ...rule, attribute: 'plan' }] }, 'rules.0.attribute'],
      ['a rule with an unknown operator', { rules: [{ ...rule, operator: 'starts_with' }] }, 'rules.0.operator'],
      ['a rule without values', { rules: [{ ...rule, values: [] }] }, 'rules.0.values'],
      ['a rule value that is not a string', { rules: [{ ...rule, values: [42] }] }, 'rules.0.values'],
      [
        'a rule without a variation',
        { rules: [{ attribute: 'country', operator: 'in', values: ['CA'] }] },
        'rules.0.variation',
      ],
      ['a negative variation', { defaultVariation: -1 }, 'defaultVariation'],
      ['a fractional variation', { offVariation: 0.5 }, 'offVariation'],
      ['rules that are not a list', { rules: rule }, 'rules'],
      ['an unknown rule property', { rules: [{ ...rule, negate: true }] }, 'rules.0.negate'],
      [
        'an individual target user ID that is not a string',
        { individualTargets: [{ variation: 0, userIds: [7] }] },
        'individualTargets.0.userIds',
      ],
      ['a null default variation', { defaultVariation: null }, 'defaultVariation'],
    ])('%s', async (_case, change, field) => {
      const projectKey = await project('production');
      await api.post(`/projects/${projectKey}/flags`, { key: 'malformed', name: 'Malformed' });
      const response = await api.patch(`/projects/${projectKey}/flags/malformed/targeting/production`, {
        version: 1,
        ...change,
      });
      expect(response.status).toBe(400);
      expect(Object.keys(response.body.fields)).toContain(field);
    });
  });

  it('returns 404 for an unknown flag or environment', async () => {
    const projectKey = await project('production');
    await api.post(`/projects/${projectKey}/flags`, { key: 'known', name: 'Known' });
    expect((await api.get(`/projects/${projectKey}/flags/known/targeting/staging`)).status).toBe(404);
    expect((await api.get(`/projects/${projectKey}/flags/unknown/targeting/production`)).status).toBe(404);
    expect(
      (await api.patch(`/projects/${projectKey}/flags/known/targeting/staging`, { version: 1, on: true })).status,
    ).toBe(404);
  });
});
