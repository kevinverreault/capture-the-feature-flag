/* eslint-disable @typescript-eslint/no-explicit-any -- tests read whatever JSON a response carries */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

const as = (actor: string) => ({ 'x-ctff-actor': actor });

describe('audit entries', () => {
  let core: RunningCore;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  /** The project's audit entries, newest first. */
  async function entries(projectKey: string, query = ''): Promise<any[]> {
    const response = await api.get(`/audit-entries?projectKey=${projectKey}${query}`);
    expect(response.status).toBe(200);
    return response.body.entries;
  }

  it('records who created a project, when, and what it was created as', async () => {
    const key = uniqueKey('project');
    const before = Date.now();
    await api.post('/projects', { key, name: 'Birdwatch' }, as('Ada'));

    const [entry, ...rest] = await entries(key);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      projectKey: key,
      targetType: 'project',
      targetId: expect.any(String),
      flagKey: null,
      environmentKey: null,
      action: 'create',
      actor: 'Ada',
      before: null,
      after: { key, name: 'Birdwatch' },
    });
    expect(new Date(entry.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('records anonymous when a change does not say who made it', async () => {
    const key = uniqueKey('project');
    await api.post('/projects', { key, name: 'Birdwatch' });
    await api.patch(`/projects/${key}`, { name: 'Birdwatch' }, as('   '));

    expect((await entries(key)).map((entry) => entry.actor)).toEqual(['anonymous', 'anonymous']);
  });

  it('decodes a percent-encoded actor, so display names are not limited to ASCII', async () => {
    const key = uniqueKey('project');
    await api.post('/projects', { key, name: 'Birdwatch' }, as(encodeURIComponent('Zoë Ørn')));

    expect((await entries(key))[0].actor).toBe('Zoë Ørn');
  });

  it('records a project rename with its name before and after', async () => {
    const key = uniqueKey('project');
    await api.post('/projects', { key, name: 'Birdwatch' }, as('Ada'));
    await api.patch(`/projects/${key}`, { name: 'Birdwatch EU' }, as('Grace'));

    const [update] = await entries(key);
    expect(update).toMatchObject({
      targetType: 'project',
      action: 'update',
      actor: 'Grace',
      before: { key, name: 'Birdwatch' },
      after: { key, name: 'Birdwatch EU' },
    });
  });

  it('keeps the entries of a deleted project, ending with its delete', async () => {
    const key = uniqueKey('project');
    await api.post('/projects', { key, name: 'Birdwatch' }, as('Ada'));
    await api.delete(`/projects/${key}`, as('Grace'));

    const own = await entries(key);
    expect(own.map((entry) => [entry.action, entry.actor])).toEqual([
      ['delete', 'Grace'],
      ['create', 'Ada'],
    ]);
    expect(own[0]).toMatchObject({ before: { key, name: 'Birdwatch' }, after: null });
    const all = await api.get('/audit-entries?limit=200');
    expect(all.body.entries.filter((entry: any) => entry.projectKey === key)).toEqual(own);
  });

  it('records nothing for a change that is rejected', async () => {
    const key = uniqueKey('project');
    await api.post('/projects', { key, name: 'Birdwatch' });
    expect((await api.post('/projects', { key, name: 'Again' })).status).toBe(409);
    expect((await api.patch(`/projects/${key}`, { key: 'renamed' })).status).toBe(400);

    expect(await entries(key)).toHaveLength(1);
  });

  async function project(): Promise<string> {
    const key = uniqueKey('project');
    await api.post('/projects', { key, name: 'Birdwatch' });
    return key;
  }

  it('records the create, update and delete of an environment, each once', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'Kill switch' });
    const created = await api.post(
      `/projects/${projectKey}/environments`,
      { key: 'production', name: 'Prod' },
      as('Ada'),
    );
    const { sdkKey } = created.body;
    await api.patch(`/projects/${projectKey}/environments/production`, { name: 'Production' }, as('Grace'));
    await api.delete(`/projects/${projectKey}/environments/production`, as('Linus'));

    const [deleted, updated, create] = await entries(projectKey);
    const environment = { targetType: 'environment', environmentKey: 'production', flagKey: null };
    expect(create).toMatchObject({
      ...environment,
      action: 'create',
      actor: 'Ada',
      before: null,
      after: { key: 'production', name: 'Prod', sdkKey },
    });
    expect(updated).toMatchObject({
      ...environment,
      action: 'update',
      actor: 'Grace',
      before: { name: 'Prod' },
      after: { name: 'Production' },
    });
    expect(deleted).toMatchObject({
      ...environment,
      action: 'delete',
      actor: 'Linus',
      before: { key: 'production', name: 'Production', sdkKey },
      after: null,
    });
    expect(create.targetId).toBe(deleted.targetId);
    // With the project's and the flag's creates, and nothing for the targeting the environment brought along.
    expect((await entries(projectKey)).map((entry) => `${entry.targetType} ${entry.action}`)).toEqual([
      'environment delete',
      'environment update',
      'environment create',
      'flag create',
      'project create',
    ]);
  });

  it('records the create, update and delete of a flag, each once', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/environments`, { key: 'production', name: 'Production' });
    await api.post(
      `/projects/${projectKey}/flags`,
      { key: 'rare-bird-alerts', name: 'Alerts', tags: ['alerts'] },
      as('Ada'),
    );
    await api.patch(
      `/projects/${projectKey}/flags/rare-bird-alerts`,
      { version: 1, name: 'Rare bird alerts', managedBy: 'terraform' },
      as('terraform'),
    );
    await api.delete(`/projects/${projectKey}/flags/rare-bird-alerts`, as('Grace'));

    const [deleted, updated, created, ...rest] = await entries(projectKey);
    const flag = { targetType: 'flag', flagKey: 'rare-bird-alerts', environmentKey: null };
    const createdState = {
      key: 'rare-bird-alerts',
      name: 'Alerts',
      description: '',
      tags: ['alerts'],
      variations: [true, false],
      managedBy: null,
      version: 1,
    };
    const updatedState = { ...createdState, name: 'Rare bird alerts', managedBy: 'terraform', version: 2 };
    expect(created).toMatchObject({ ...flag, action: 'create', actor: 'Ada', before: null, after: createdState });
    expect(updated).toMatchObject({
      ...flag,
      action: 'update',
      actor: 'terraform',
      before: createdState,
      after: updatedState,
    });
    expect(deleted).toMatchObject({ ...flag, action: 'delete', actor: 'Grace', before: updatedState, after: null });
    expect(rest.map((entry) => entry.targetType)).toEqual(['environment', 'project']);
  });

  it('records nothing for a stale flag update', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'Kill switch' });
    await api.patch(`/projects/${projectKey}/flags/kill-switch`, { version: 1, name: 'First' });
    const stale = await api.patch(`/projects/${projectKey}/flags/kill-switch`, { version: 1, name: 'Second' });
    expect(stale.status).toBe(409);

    expect((await entries(projectKey)).map((entry) => entry.action)).toEqual(['update', 'create', 'create']);
  });

  it('records a targeting change with the targeting before and after', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/environments`, { key: 'production', name: 'Production' });
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'Kill switch' });
    await api.patch(
      `/projects/${projectKey}/flags/kill-switch/targeting/production`,
      { version: 1, on: true },
      as('Ada'),
    );
    expect(
      (await api.patch(`/projects/${projectKey}/flags/kill-switch/targeting/production`, { version: 1, on: false }))
        .status,
    ).toBe(409);

    const [entry, ...rest] = await entries(projectKey);
    const offState = { on: false, offVariation: 1, defaultVariation: 0, individualTargets: [], rules: [], version: 1 };
    expect(entry).toMatchObject({
      targetType: 'targeting',
      flagKey: 'kill-switch',
      environmentKey: 'production',
      action: 'update',
      actor: 'Ada',
      before: offState,
      after: { ...offState, on: true, version: 2 },
    });
    expect(rest.map((other) => other.action)).toEqual(['create', 'create', 'create']);
  });

  it("lists a flag's own entries, its targeting's included, newest first", async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/environments`, { key: 'production', name: 'Production' });
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'Kill switch' });
    await api.post(`/projects/${projectKey}/flags`, { key: 'other-flag', name: 'Other' });
    await api.patch(`/projects/${projectKey}/flags/kill-switch/targeting/production`, { version: 1, on: true });
    await api.patch(`/projects/${projectKey}/flags/other-flag`, { version: 1, name: 'Other flag' });
    await api.patch(`/projects/${projectKey}/flags/kill-switch`, { version: 1, name: 'Kill switch!' });

    const own = await entries(projectKey, '&flagKey=kill-switch');
    expect(own.map((entry) => `${entry.targetType} ${entry.action}`)).toEqual([
      'flag update',
      'targeting update',
      'flag create',
    ]);
    expect(own.every((entry) => entry.flagKey === 'kill-switch')).toBe(true);
  });

  it('lists the history of a flag key, across a delete and a new flag with the same key', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'First' });
    await api.delete(`/projects/${projectKey}/flags/kill-switch`);
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'Second' });

    const own = await entries(projectKey, '&flagKey=kill-switch');
    expect(own.map((entry) => `${entry.action} ${(entry.after ?? entry.before).name}`)).toEqual([
      'create Second',
      'delete First',
      'create First',
    ]);
  });

  it('lists nothing for keys that never had entries, and rejects a flag filter without a project', async () => {
    const projectKey = await project();
    expect(await entries(projectKey, '&flagKey=missing')).toEqual([]);
    expect(await entries('missing-project')).toEqual([]);
    expect((await api.get('/audit-entries?flagKey=kill-switch')).status).toBe(400);
    expect((await api.get(`/audit-entries?projectKey=${projectKey}&limit=0`)).status).toBe(400);
  });

  it('lists concurrent changes in the order they were made, by id and by time alike', async () => {
    const projectKey = await project();
    const flagKeys = Array.from({ length: 12 }, (_, index) => `flag-${index}`);
    for (const key of flagKeys) await api.post(`/projects/${projectKey}/flags`, { key, name: key });

    await Promise.all(
      flagKeys.flatMap((key) => [
        api.patch(`/projects/${projectKey}/flags/${key}`, { version: 1, name: `${key}!` }),
        api.patch(`/projects/${projectKey}`, { name: key }),
      ]),
    );

    const listed = await entries(projectKey, '&limit=200');
    const times = listed.map((entry) => new Date(entry.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    const ids = listed.map((entry) => entry.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it('pages through entries, newest first, with a cursor', async () => {
    const projectKey = await project();
    for (const name of ['One', 'Two', 'Three', 'Four']) await api.patch(`/projects/${projectKey}`, { name });

    const first = await api.get(`/audit-entries?projectKey=${projectKey}&limit=2`);
    expect(first.body.entries.map((entry: any) => entry.after.name)).toEqual(['Four', 'Three']);
    const second = await api.get(`/audit-entries?projectKey=${projectKey}&limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.entries.map((entry: any) => entry.after.name)).toEqual(['Two', 'One']);
    const last = await api.get(`/audit-entries?projectKey=${projectKey}&limit=2&cursor=${second.body.nextCursor}`);
    expect(last.body.entries.map((entry: any) => entry.action)).toEqual(['create']);
    expect(last.body.nextCursor).toBeNull();
  });
});
