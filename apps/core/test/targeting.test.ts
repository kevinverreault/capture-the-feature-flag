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
