import type { EnvironmentSnapshot } from '@ctff/evaluation';
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

  const snapshot = (sdkKey: string, headers?: Record<string, string>) =>
    api.get<EnvironmentSnapshot>(`/evaluator/snapshots/${sdkKey}`, headers);

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
    ['deleting a flag', (p: string) => api.delete(`/projects/${p}/flags/watched`)],
  ])('sends a new ETag after %s', async (_change, change) => {
    const { projectKey, production } = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'watched', name: 'Watched' });
    const etag = (await snapshot(production)).headers.get('etag') ?? '';
    expect(etag).not.toBe('');

    expect((await change(projectKey)).status).toBeLessThan(300);

    const changed = await snapshot(production, { 'if-none-match': etag });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(etag);
  });

  it('returns 404 for an unknown SDK key', async () => {
    expect((await snapshot('ctff-env-unknown')).status).toBe(404);
  });
});
