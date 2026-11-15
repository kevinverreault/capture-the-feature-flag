import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

describe('projects', () => {
  let core: RunningCore;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  it('creates a project and reads it back by key', async () => {
    const key = uniqueKey('birdwatch');
    const created = await api.post('/projects', { key, name: 'Birdwatch' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ key, name: 'Birdwatch' });

    const read = await api.get(`/projects/${key}`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ key, name: 'Birdwatch' });
  });

  it('lists projects', async () => {
    const key = uniqueKey('listed');
    await api.post('/projects', { key, name: 'Listed' });
    const list = await api.get<{ key: string }[]>('/projects');
    expect(list.status).toBe(200);
    expect(list.body.map((project) => project.key)).toContain(key);
  });

  it('renames a project', async () => {
    const key = uniqueKey('renamed');
    await api.post('/projects', { key, name: 'Before' });
    const renamed = await api.patch(`/projects/${key}`, { name: 'After' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ key, name: 'After' });
    expect((await api.get(`/projects/${key}`)).body).toMatchObject({ name: 'After' });
  });

  it('does not let a project key change', async () => {
    const key = uniqueKey('fixed');
    await api.post('/projects', { key, name: 'Fixed' });
    const attempt = await api.patch(`/projects/${key}`, { key: 'other-key', name: 'Fixed' });
    expect(attempt.status).toBe(400);
    expect((await api.get(`/projects/${key}`)).status).toBe(200);
    expect((await api.get('/projects/other-key')).status).toBe(404);
  });

  it('deletes a project', async () => {
    const key = uniqueKey('deleted');
    await api.post('/projects', { key, name: 'Deleted' });
    expect((await api.delete(`/projects/${key}`)).status).toBe(204);
    expect((await api.get(`/projects/${key}`)).status).toBe(404);
    expect((await api.delete(`/projects/${key}`)).status).toBe(404);
  });

  it('rejects a duplicate project key with 409', async () => {
    const key = uniqueKey('duplicate');
    await api.post('/projects', { key, name: 'First' });
    expect((await api.post('/projects', { key, name: 'Second' })).status).toBe(409);
  });

  it.each(['Birdwatch', 'bird_watch', 'bird watch', '-birdwatch', 'birdwatch-', 'bird--watch', ''])(
    'rejects the invalid project key %j with 400',
    async (key) => {
      expect((await api.post('/projects', { key, name: 'Invalid' })).status).toBe(400);
    },
  );

  it('requires a name', async () => {
    expect((await api.post('/projects', { key: uniqueKey('nameless') })).status).toBe(400);
    expect((await api.post('/projects', { key: uniqueKey('blank'), name: '  ' })).status).toBe(400);
  });

  it('rejects a null name with 400', async () => {
    const key = uniqueKey('nulled');
    await api.post('/projects', { key, name: 'Nulled' });
    expect((await api.patch(`/projects/${key}`, { name: null })).status).toBe(400);
  });

  it('returns 404 for an unknown project', async () => {
    expect((await api.get('/projects/no-such-project')).status).toBe(404);
    expect((await api.patch('/projects/no-such-project', { name: 'x' })).status).toBe(404);
  });
});
