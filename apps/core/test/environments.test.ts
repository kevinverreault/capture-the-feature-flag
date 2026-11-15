import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

describe('environments', () => {
  let core: RunningCore;
  let api: ApiClient;
  let projectKey: string;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
    projectKey = uniqueKey('project');
    await api.post('/projects', { key: projectKey, name: 'Project' });
  });
  afterAll(() => core?.stop());

  const environments = () => `/projects/${projectKey}/environments`;

  it('creates an environment with a generated SDK key and reads it back', async () => {
    const created = await api.post(environments(), { key: 'production', name: 'Production' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ key: 'production', name: 'Production', projectKey });
    expect(created.body.sdkKey).toMatch(/^ctff-env-[A-Za-z0-9_-]{20,}$/);

    const read = await api.get(`${environments()}/production`);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(created.body);
  });

  it('gives every environment its own SDK key', async () => {
    const otherProject = uniqueKey('other');
    await api.post('/projects', { key: otherProject, name: 'Other' });
    const sdkKeys = await Promise.all(
      [
        api.post(environments(), { key: 'staging', name: 'Staging' }),
        api.post(environments(), { key: 'development', name: 'Development' }),
        api.post(`/projects/${otherProject}/environments`, { key: 'development', name: 'Development' }),
      ].map(async (response) => (await response).body.sdkKey as string),
    );
    expect(new Set(sdkKeys).size).toBe(3);
  });

  it('lists the environments of a project', async () => {
    const key = uniqueKey('listed');
    await api.post(environments(), { key, name: 'Listed' });
    const list = await api.get<{ key: string }[]>(environments());
    expect(list.status).toBe(200);
    expect(list.body.map((environment) => environment.key)).toContain(key);
  });

  it('renames an environment without changing its SDK key', async () => {
    const key = uniqueKey('renamed');
    const created = await api.post(environments(), { key, name: 'Before' });
    const renamed = await api.patch(`${environments()}/${key}`, { name: 'After' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ key, name: 'After', sdkKey: created.body.sdkKey });
  });

  it('does not let an environment key or SDK key change', async () => {
    const key = uniqueKey('fixed');
    await api.post(environments(), { key, name: 'Fixed' });
    expect((await api.patch(`${environments()}/${key}`, { key: 'moved' })).status).toBe(400);
    expect((await api.patch(`${environments()}/${key}`, { sdkKey: 'ctff-env-chosen' })).status).toBe(400);
  });

  it('accepts a rename that repeats the unchanged environment key and SDK key', async () => {
    const key = uniqueKey('repeated');
    const created = await api.post(environments(), { key, name: 'Before' });
    const renamed = await api.patch(`${environments()}/${key}`, { key, sdkKey: created.body.sdkKey, name: 'After' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ key, name: 'After', sdkKey: created.body.sdkKey });
  });

  it('deletes an environment', async () => {
    const key = uniqueKey('deleted');
    await api.post(environments(), { key, name: 'Deleted' });
    expect((await api.delete(`${environments()}/${key}`)).status).toBe(204);
    expect((await api.get(`${environments()}/${key}`)).status).toBe(404);
  });

  it('rejects a duplicate environment key within a project with 409', async () => {
    const key = uniqueKey('duplicate');
    await api.post(environments(), { key, name: 'First' });
    expect((await api.post(environments(), { key, name: 'Second' })).status).toBe(409);
  });

  it('rejects an invalid environment key with 400', async () => {
    expect((await api.post(environments(), { key: 'Prod_1', name: 'Invalid' })).status).toBe(400);
  });

  it('returns 404 for an unknown project or environment', async () => {
    expect((await api.get('/projects/no-such-project/environments')).status).toBe(404);
    expect((await api.post('/projects/no-such-project/environments', { key: 'dev', name: 'Dev' })).status).toBe(404);
    expect((await api.get(`${environments()}/no-such-environment`)).status).toBe(404);
  });

  it('deletes the environments of a deleted project', async () => {
    const doomed = uniqueKey('doomed');
    await api.post('/projects', { key: doomed, name: 'Doomed' });
    await api.post(`/projects/${doomed}/environments`, { key: 'production', name: 'Production' });
    await api.delete(`/projects/${doomed}`);
    await api.post('/projects', { key: doomed, name: 'Reborn' });
    expect((await api.get<unknown[]>(`/projects/${doomed}/environments`)).body).toEqual([]);
  });
});
