import type { EnvironmentList, EnvironmentSnapshot } from '@ctff/evaluation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

describe('evaluator snapshot', () => {
  let core: RunningCore;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  /** A project with `development` and `production`, returning the SDK key of each. */
  async function project(): Promise<{ projectKey: string; development: string; production: string }> {
    const projectKey = uniqueKey('project');
    await api.post('/projects', { key: projectKey, name: 'Project' });
    const development = await api.post(`/projects/${projectKey}/environments`, { key: 'development', name: 'Dev' });
    const production = await api.post(`/projects/${projectKey}/environments`, { key: 'production', name: 'Prod' });
    return { projectKey, development: development.body.sdkKey, production: production.body.sdkKey };
  }

  // The SDK key travels in a header, not the URL, so it stays out of access logs.
  const snapshot = (sdkKey: string, headers: Record<string, string> = {}) =>
    api.get<EnvironmentSnapshot>('/evaluator/snapshot', { 'x-ctff-sdk-key': sdkKey, ...headers });

  it("returns the targeting of every flag in the SDK key's environment", async () => {
    const { projectKey, development, production } = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'rare-bird-alerts', name: 'Rare bird alerts' });
    await api.post(`/projects/${projectKey}/flags`, { key: 'new-sighting-form', name: 'New sighting form' });
    await api.patch(`/projects/${projectKey}/flags/rare-bird-alerts/targeting/production`, { version: 1, on: true });

    const response = await snapshot(production);
    expect(response.status).toBe(200);
    const expected: EnvironmentSnapshot = {
      projectKey,
      environmentKey: 'production',
      flags: [
        {
          key: 'new-sighting-form',
          variations: [true, false],
          version: 1,
          targeting: { on: false, offVariation: 1, defaultVariation: 0, individualTargets: [], rules: [], version: 1 },
        },
        {
          key: 'rare-bird-alerts',
          variations: [true, false],
          version: 1,
          targeting: { on: true, offVariation: 1, defaultVariation: 0, individualTargets: [], rules: [], version: 2 },
        },
      ],
    };
    expect(response.body).toEqual(expected);

    const other = await snapshot(development);
    expect(other.body.environmentKey).toBe('development');
    expect(other.body.flags.map((flag) => flag.targeting.on)).toEqual([false, false]);
  });

  it('only contains the flags of its own project', async () => {
    const first = await project();
    const second = await project();
    await api.post(`/projects/${second.projectKey}/flags`, { key: 'elsewhere', name: 'Elsewhere' });
    expect((await snapshot(first.production)).body.flags).toEqual([]);
  });

  it('sends an ETag and answers 304 to If-None-Match while nothing changed', async () => {
    const { projectKey, production } = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'cached', name: 'Cached' });

    const first = await snapshot(production);
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^"[^"]+"$/);

    const again = await snapshot(production, { 'if-none-match': etag ?? '' });
    expect(again.status).toBe(304);
    expect(again.body).toBeUndefined();
    expect(again.headers.get('etag')).toBe(etag);
  });

  it.each([
    [
      'switching targeting',
      (p: string) => api.patch(`/projects/${p}/flags/watched/targeting/production`, { version: 1, on: true }),
    ],
    ['adding a flag', (p: string) => api.post(`/projects/${p}/flags`, { key: 'added', name: 'Added' })],
    ['editing a flag', (p: string) => api.patch(`/projects/${p}/flags/watched`, { version: 1, name: 'Edited' })],
    ['archiving a flag', (p: string) => api.post(`/projects/${p}/flags/watched/archive`, {})],
    ['restoring a flag', (p: string) => api.post(`/projects/${p}/flags/archived/restore`, {})],
  ])('sends a new ETag after %s', async (_change, change) => {
    const { projectKey, production } = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'watched', name: 'Watched' });
    await api.post(`/projects/${projectKey}/flags`, { key: 'archived', name: 'Archived' });
    await api.post(`/projects/${projectKey}/flags/archived/archive`, {});
    const etag = (await snapshot(production)).headers.get('etag') ?? '';
    expect(etag).not.toBe('');

    expect((await change(projectKey)).status).toBeLessThan(300);

    const changed = await snapshot(production, { 'if-none-match': etag });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(etag);
  });

  it('returns 404 for an unknown SDK key and 400 without one', async () => {
    expect((await snapshot('ctff-env-unknown')).status).toBe(404);
    expect((await api.get('/evaluator/snapshot')).status).toBe(400);
  });

  it('keeps the SDK key out of the logs', async () => {
    const { production } = await project();
    const snapshotRequests = () =>
      core.logs.filter((entry) => (entry['req'] as { url?: string } | undefined)?.url === '/api/v1/evaluator/snapshot')
        .length;
    const before = snapshotRequests();

    await snapshot(production);

    await expect.poll(snapshotRequests).toBe(before + 1);
    expect(JSON.stringify(core.logs)).not.toContain(production);
  });
});

describe('evaluator environment list', () => {
  let core: RunningCore;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  const environments = (headers: Record<string, string> = {}) =>
    api.get<EnvironmentList>('/evaluator/environments', headers);

  it('lists every environment of every project with its SDK key, so Evaluators know which snapshots to poll', async () => {
    const first = uniqueKey('project');
    const second = uniqueKey('project');
    await api.post('/projects', { key: first, name: 'First' });
    await api.post('/projects', { key: second, name: 'Second' });
    const created = [
      await api.post(`/projects/${first}/environments`, { key: 'development', name: 'Dev' }),
      await api.post(`/projects/${first}/environments`, { key: 'production', name: 'Prod' }),
      await api.post(`/projects/${second}/environments`, { key: 'production', name: 'Prod' }),
    ].map(({ body }) => ({ projectKey: body.projectKey, environmentKey: body.key, sdkKey: body.sdkKey }));

    const response = await environments();
    expect(response.status).toBe(200);
    const expected: EnvironmentList = {
      environments: [...created].sort((a, b) => (a.sdkKey < b.sdkKey ? -1 : 1)),
    };
    expect(response.body).toEqual(expected);
  });

  it('sends an ETag, answers 304 while nothing changed and a new list once an environment is added or deleted', async () => {
    const projectKey = uniqueKey('project');
    await api.post('/projects', { key: projectKey, name: 'Project' });
    await api.post(`/projects/${projectKey}/environments`, { key: 'development', name: 'Dev' });

    const first = await environments();
    const etag = first.headers.get('etag') ?? '';
    expect(etag).toMatch(/^"[^"]+"$/);
    expect((await environments({ 'if-none-match': etag })).status).toBe(304);

    // Flag changes show in snapshots, not in the environment list.
    await api.post(`/projects/${projectKey}/flags`, { key: 'unrelated', name: 'Unrelated' });
    expect((await environments({ 'if-none-match': etag })).status).toBe(304);

    await api.post(`/projects/${projectKey}/environments`, { key: 'production', name: 'Prod' });
    const added = await environments({ 'if-none-match': etag });
    expect(added.status).toBe(200);
    const addedEtag = added.headers.get('etag') ?? '';
    expect(addedEtag).not.toBe(etag);

    await api.delete(`/projects/${projectKey}/environments/production`);
    const deleted = await environments({ 'if-none-match': addedEtag });
    expect(deleted.status).toBe(200);
    expect(deleted.body.environments.filter((entry) => entry.projectKey === projectKey)).toEqual([
      expect.objectContaining({ environmentKey: 'development' }),
    ]);
  });
});
