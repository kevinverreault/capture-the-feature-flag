import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

describe('flags', () => {
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

  const flags = (project = projectKey) => `/projects/${project}/flags`;

  it('creates a boolean flag stored as the variations [true, false]', async () => {
    const created = await api.post(flags(), {
      key: 'rare-bird-alerts',
      name: 'Rare bird alerts',
      description: 'Banner for rare sightings nearby',
      tags: ['alerts', 'birdwatch'],
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      projectKey,
      key: 'rare-bird-alerts',
      name: 'Rare bird alerts',
      description: 'Banner for rare sightings nearby',
      tags: ['alerts', 'birdwatch'],
      variations: [true, false],
      version: 1,
    });

    const read = await api.get(`${flags()}/rare-bird-alerts`);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(created.body);
  });

  it('defaults the description and tags', async () => {
    const created = await api.post(flags(), { key: uniqueKey('plain'), name: 'Plain' });
    expect(created.body).toMatchObject({ description: '', tags: [] });
  });

  it('does not accept other variations', async () => {
    const attempt = await api.post(flags(), { key: uniqueKey('multi'), name: 'Multi', variations: ['a', 'b'] });
    expect(attempt.status).toBe(400);
  });

  it('lists the flags of a project', async () => {
    const key = uniqueKey('listed');
    await api.post(flags(), { key, name: 'Listed' });
    const list = await api.get<{ key: string }[]>(flags());
    expect(list.status).toBe(200);
    expect(list.body.map((flag) => flag.key)).toContain(key);
  });

  it.each(['Rare-Bird-Alerts', 'rare_bird_alerts', 'rare bird', 'rare--bird', '-rare', 'rare-', '1-rare', ''])(
    'rejects the flag key %j with 400',
    async (key) => {
      expect((await api.post(flags(), { key, name: 'Invalid' })).status).toBe(400);
    },
  );

  it('keeps flag keys unique per project', async () => {
    const key = uniqueKey('unique');
    expect((await api.post(flags(), { key, name: 'First' })).status).toBe(201);
    expect((await api.post(flags(), { key, name: 'Second' })).status).toBe(409);

    const otherProject = uniqueKey('other');
    await api.post('/projects', { key: otherProject, name: 'Other' });
    expect((await api.post(flags(otherProject), { key, name: 'Elsewhere' })).status).toBe(201);
  });

  it('edits the name, description and tags, bumping the version', async () => {
    const key = uniqueKey('edited');
    await api.post(flags(), { key, name: 'Before' });
    const edited = await api.patch(`${flags()}/${key}`, {
      version: 1,
      name: 'After',
      description: 'Now documented',
      tags: ['beta'],
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      key,
      name: 'After',
      description: 'Now documented',
      tags: ['beta'],
      version: 2,
    });
  });

  it('rejects an edit based on an outdated version with 409', async () => {
    const key = uniqueKey('contended');
    await api.post(flags(), { key, name: 'Original' });
    expect((await api.patch(`${flags()}/${key}`, { version: 1, name: 'First edit' })).status).toBe(200);

    const stale = await api.patch(`${flags()}/${key}`, { version: 1, name: 'Stale edit' });
    expect(stale.status).toBe(409);
    expect((await api.get(`${flags()}/${key}`)).body).toMatchObject({ name: 'First edit', version: 2 });
  });

  it.each([['name'], ['description'], ['tags']])('rejects a null %s with 400', async (field) => {
    const key = uniqueKey('nulled');
    await api.post(flags(), { key, name: 'Nulled' });
    expect((await api.patch(`${flags()}/${key}`, { version: 1, [field]: null })).status).toBe(400);
  });

  it('requires the version an edit is based on', async () => {
    const key = uniqueKey('unversioned');
    await api.post(flags(), { key, name: 'Unversioned' });
    expect((await api.patch(`${flags()}/${key}`, { name: 'No version' })).status).toBe(400);
  });

  it('does not let a flag key change', async () => {
    const key = uniqueKey('immutable');
    await api.post(flags(), { key, name: 'Immutable' });
    const attempt = await api.patch(`${flags()}/${key}`, { version: 1, key: 'renamed-key' });
    expect(attempt.status).toBe(400);
    expect(attempt.body.message).toEqual(expect.arrayContaining([expect.stringMatching(/immutable/)]));
    expect((await api.get(`${flags()}/${key}`)).body).toMatchObject({ key, version: 1 });
  });

  it('accepts an edit that repeats the unchanged flag key', async () => {
    const key = uniqueKey('repeated');
    await api.post(flags(), { key, name: 'Repeated' });
    const edited = await api.patch(`${flags()}/${key}`, { version: 1, key, name: 'Still repeated' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ key, name: 'Still repeated' });
  });

  it('is managed by nothing unless the creator says otherwise', async () => {
    const created = await api.post(flags(), { key: uniqueKey('unmanaged'), name: 'Unmanaged' });
    expect(created.body).toMatchObject({ managedBy: null });
  });

  it('stores and returns the tool a flag is managed by', async () => {
    const key = uniqueKey('managed');
    const created = await api.post(flags(), { key, name: 'Managed', managedBy: 'terraform' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ managedBy: 'terraform' });
    expect((await api.get(`${flags()}/${key}`)).body).toMatchObject({ managedBy: 'terraform' });
    expect((await api.get(flags())).body).toEqual(
      expect.arrayContaining([expect.objectContaining({ key, managedBy: 'terraform' })]),
    );
  });

  it('marks an existing flag as managed, and releases it again with null', async () => {
    const key = uniqueKey('adopted');
    await api.post(flags(), { key, name: 'Adopted' });
    const adopted = await api.patch(`${flags()}/${key}`, { version: 1, managedBy: 'terraform' });
    expect(adopted.body).toMatchObject({ managedBy: 'terraform', version: 2 });

    const kept = await api.patch(`${flags()}/${key}`, { version: 2, name: 'Renamed' });
    expect(kept.body).toMatchObject({ managedBy: 'terraform', name: 'Renamed', version: 3 });

    const released = await api.patch(`${flags()}/${key}`, { version: 3, managedBy: null });
    expect(released.status).toBe(200);
    expect(released.body).toMatchObject({ managedBy: null, version: 4 });
  });

  it.each(['', 'Terraform', 'terraform cloud', 42])('rejects the managed-by marker %j with 400', async (managedBy) => {
    expect((await api.post(flags(), { key: uniqueKey('bad-marker'), name: 'Bad', managedBy })).status).toBe(400);
  });

  it('deletes a flag', async () => {
    const key = uniqueKey('deleted');
    await api.post(flags(), { key, name: 'Deleted' });
    expect((await api.delete(`${flags()}/${key}`)).status).toBe(204);
    expect((await api.get(`${flags()}/${key}`)).status).toBe(404);
  });

  it('returns 404 for an unknown project or flag', async () => {
    expect((await api.post(flags('no-such-project'), { key: 'some-flag', name: 'x' })).status).toBe(404);
    expect((await api.get(`${flags()}/no-such-flag`)).status).toBe(404);
    expect((await api.patch(`${flags()}/no-such-flag`, { version: 1, name: 'x' })).status).toBe(404);
  });
});
