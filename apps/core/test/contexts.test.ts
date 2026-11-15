import { type Context, contextAttributeKeys, type EnvironmentSnapshot, evaluate } from '@ctff/evaluation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

describe('context attributes', () => {
  let core: RunningCore;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  it('lists the built-in context attributes', async () => {
    const response = await api.get('/context-attributes');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        key: 'user_id',
        name: 'User ID',
        type: 'string',
        description: expect.any(String),
        builtIn: true,
      },
      {
        key: 'country',
        name: 'Country',
        type: 'country_code',
        description: expect.any(String),
        builtIn: true,
      },
    ]);
    // Every attribute rules can test is listed, and nothing else.
    expect(response.body.map((attribute: { key: string }) => attribute.key).sort()).toEqual(
      [...contextAttributeKeys].sort(),
    );
  });

  it('cannot change or delete a built-in context attribute', async () => {
    const before = (await api.get('/context-attributes')).body;
    for (const response of [
      await api.patch('/context-attributes/country', { name: 'Nation' }),
      await api.request('PUT', '/context-attributes/country', { key: 'country', name: 'Nation', type: 'string' }),
      await api.delete('/context-attributes/user_id'),
      await api.post('/context-attributes', { key: 'plan', name: 'Plan', type: 'string' }),
    ]) {
      expect(response.status).toBe(405);
    }
    expect((await api.get('/context-attributes/country')).status).toBe(404);
    expect((await api.get('/context-attributes')).body).toEqual(before);
  });
});

/** The moment `seconds` before now, as an ISO timestamp. */
const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

/** Records the contexts as seen in the environment, each `seconds` ago, as an Evaluator reports them. */
async function see(api: ApiClient, sdkKey: string, seen: [Context, number][]): Promise<void> {
  const response = await api.post('/evaluator/telemetry', {
    environments: [
      { sdkKey, counts: [], seenContexts: seen.map(([context, ago]) => ({ context, lastSeen: secondsAgo(ago) })) },
    ],
  });
  expect(response.status).toBe(204);
}

describe('seen contexts', () => {
  let core: RunningCore;
  let api: ApiClient;
  let projectKey: string;
  let sdkKey: string;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
    projectKey = uniqueKey('contexts');
    await api.post('/projects', { key: projectKey, name: 'Contexts' });
    sdkKey = (await api.post(`/projects/${projectKey}/environments`, { key: 'production', name: 'Production' })).body
      .sdkKey;
    await see(api, sdkKey, [
      [{ user_id: 'alice', country: 'ca' }, 30],
      [{ user_id: 'Malice' }, 20],
      [{ user_id: 'bob', country: 'US' }, 10],
      [{ country: 'FR' }, 5],
      [{ user_id: '50%_off' }, 40],
    ]);
  });
  afterAll(() => core?.stop());

  const seenContexts = (query = '') => api.get(`/projects/${projectKey}/environments/production/seen-contexts${query}`);
  const contexts = (body: { context: Context }[]) => body.map((seen) => seen.context);

  it('lists the seen contexts of an environment, most recently seen first', async () => {
    const response = await seenContexts();
    expect(response.status).toBe(200);
    expect(contexts(response.body)).toEqual([
      { country: 'FR' },
      { user_id: 'bob', country: 'US' },
      { user_id: 'Malice' },
      { user_id: 'alice', country: 'CA' },
      { user_id: '50%_off' },
    ]);
  });

  it('searches the seen contexts by user_id, ignoring case', async () => {
    expect(contexts((await seenContexts('?userId=ALIC')).body)).toEqual([
      { user_id: 'Malice' },
      { user_id: 'alice', country: 'CA' },
    ]);
    expect(contexts((await seenContexts('?userId=bob&limit=1')).body)).toEqual([{ user_id: 'bob', country: 'US' }]);
    expect((await seenContexts('?userId=nobody')).body).toEqual([]);
    // Wildcards are matched as themselves.
    expect(contexts((await seenContexts('?userId=%25')).body)).toEqual([{ user_id: '50%_off' }]);
    expect(contexts((await seenContexts('?userId=0%25_O')).body)).toEqual([{ user_id: '50%_off' }]);
    expect(contexts((await seenContexts('?userId=c_')).body)).toEqual([]);
    expect(contexts((await seenContexts('?userId=a%25e')).body)).toEqual([]);
    expect((await seenContexts('?userId=%5C')).body).toEqual([]);
  });

  it('answers 404 for an unknown environment', async () => {
    expect((await api.get(`/projects/${projectKey}/environments/staging/seen-contexts`)).status).toBe(404);
  });
});

describe('evaluating every flag for a context', () => {
  let core: RunningCore;
  let api: ApiClient;
  let projectKey: string;
  let sdkKey: string;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
    projectKey = uniqueKey('evaluate');
    await api.post('/projects', { key: projectKey, name: 'Evaluate' });
    sdkKey = (await api.post(`/projects/${projectKey}/environments`, { key: 'production', name: 'Production' })).body
      .sdkKey;
    await api.post(`/projects/${projectKey}/environments`, { key: 'staging', name: 'Staging' });
    const flags = `/projects/${projectKey}/flags`;
    for (const key of ['kill-switch', 'photo-id-beta', 'rare-bird-alerts', 'retired-flag', 'new-sighting-form']) {
      await api.post(flags, { key, name: `Flag ${key}` });
    }
    // Variations are [true, false]: index 0 is true, 1 is false.
    await api.patch(`${flags}/photo-id-beta/targeting/production`, {
      version: 1,
      on: true,
      defaultVariation: 1,
      individualTargets: [{ variation: 0, userIds: ['alice'] }],
    });
    await api.patch(`${flags}/rare-bird-alerts/targeting/production`, {
      version: 1,
      on: true,
      defaultVariation: 1,
      rules: [
        { attribute: 'user_id', operator: 'in', values: ['bob'], variation: 1 },
        { attribute: 'country', operator: 'in', values: ['CA', 'US'], variation: 0 },
      ],
    });
    await api.patch(`${flags}/new-sighting-form/targeting/production`, { version: 1, on: true });
    await api.patch(`${flags}/new-sighting-form/targeting/staging`, { version: 1, on: true, defaultVariation: 1 });
    await api.post(`${flags}/retired-flag/archive`, {});
  });
  afterAll(() => core?.stop());

  const evaluateAll = (context: unknown, environmentKey = 'production') =>
    api.post(`/projects/${projectKey}/environments/${environmentKey}/evaluate`, { context });

  it('serves each flag that is not archived, with its variation and evaluation reason', async () => {
    const response = await evaluateAll({ user_id: 'alice', country: 'ca' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      context: { user_id: 'alice', country: 'CA' },
      flags: [
        {
          flagKey: 'kill-switch',
          flagName: 'Flag kill-switch',
          value: false,
          variationIndex: 1,
          reason: { kind: 'OFF' },
        },
        {
          flagKey: 'new-sighting-form',
          flagName: 'Flag new-sighting-form',
          value: true,
          variationIndex: 0,
          reason: { kind: 'DEFAULT' },
        },
        {
          flagKey: 'photo-id-beta',
          flagName: 'Flag photo-id-beta',
          value: true,
          variationIndex: 0,
          reason: { kind: 'TARGET_MATCH' },
        },
        {
          flagKey: 'rare-bird-alerts',
          flagName: 'Flag rare-bird-alerts',
          value: true,
          variationIndex: 0,
          reason: { kind: 'RULE_MATCH', ruleIndex: 1 },
        },
      ],
    });
  });

  it('evaluates against the targeting of the environment asked for', async () => {
    const response = await evaluateAll({ user_id: 'alice' }, 'staging');
    expect(response.body.flags.find((flag: { flagKey: string }) => flag.flagKey === 'new-sighting-form')).toEqual({
      flagKey: 'new-sighting-form',
      flagName: 'Flag new-sighting-form',
      value: false,
      variationIndex: 1,
      reason: { kind: 'DEFAULT' },
    });
  });

  it('gives the same results as the evaluation library on the snapshot the Evaluator gets', async () => {
    const snapshot: EnvironmentSnapshot = (await api.get('/evaluator/snapshot', { 'x-ctff-sdk-key': sdkKey })).body;
    const contexts: Context[] = [
      {},
      { user_id: 'alice' },
      { user_id: 'bob', country: 'US' },
      { user_id: 'carol', country: 'us' },
      { country: 'FR' },
      { user_id: 'dave', country: 'CA' },
    ];
    for (const context of contexts) {
      const { body } = await evaluateAll(context);
      expect(body.flags).toEqual(
        snapshot.flags.map((flag) => ({
          flagKey: flag.key,
          flagName: `Flag ${flag.key}`,
          ...evaluate(snapshot, flag.key, context),
        })),
      );
    }
  });

  it('rejects a malformed context, and answers 404 for an unknown environment', async () => {
    expect((await evaluateAll({ country: 'Canada' })).status).toBe(400);
    expect((await evaluateAll({ user_id: '' })).status).toBe(400);
    expect((await evaluateAll(undefined)).status).toBe(400);
    expect((await evaluateAll({ user_id: 'alice' }, 'qa')).status).toBe(404);
  });

  it('does not record the contexts it evaluates as seen', async () => {
    await evaluateAll({ user_id: 'zed' });
    expect((await api.get(`/projects/${projectKey}/environments/production/seen-contexts`)).body).toEqual([]);
  });
});
