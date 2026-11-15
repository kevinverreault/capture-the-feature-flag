import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

describe('archived flags', () => {
  let core: RunningCore;
  let api: ApiClient;
  let projectKey: string;
  let sdkKey: string;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
    projectKey = uniqueKey('archive');
    await api.post('/projects', { key: projectKey, name: 'Archive' });
    sdkKey = (await api.post(`/projects/${projectKey}/environments`, { key: 'production', name: 'Production' })).body
      .sdkKey;
  });
  afterAll(() => core?.stop());

  const flag = (key: string) => `/projects/${projectKey}/flags/${key}`;
  async function createFlag(prefix: string): Promise<string> {
    const key = uniqueKey(prefix);
    expect((await api.post(`/projects/${projectKey}/flags`, { key, name: 'Flag' })).status).toBe(201);
    return key;
  }
  const snapshotKeys = async () =>
    (await api.get<{ flags: { key: string }[] }>('/evaluator/snapshot', { 'x-ctff-sdk-key': sdkKey })).body.flags.map(
      (listed) => listed.key,
    );

  it('starts a flag out not archived', async () => {
    const key = await createFlag('fresh');
    expect((await api.get(flag(key))).body).toMatchObject({ archived: false, archivedAt: null });
  });

  it('archives a flag, bumping its version', async () => {
    const key = await createFlag('archived');
    const archived = await api.post(`${flag(key)}/archive`, {});
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ key, archived: true, version: 2 });
    expect(new Date(archived.body.archivedAt).getTime()).not.toBeNaN();
    expect((await api.get(flag(key))).body).toEqual(archived.body);
  });

  it('leaves an archived flag out of the snapshot, and restores it with the targeting it had', async () => {
    const key = await createFlag('restored');
    await api.patch(`${flag(key)}/targeting/production`, { version: 1, on: true });
    expect(await snapshotKeys()).toContain(key);

    await api.post(`${flag(key)}/archive`, {});
    expect(await snapshotKeys()).not.toContain(key);

    const restored = await api.post(`${flag(key)}/restore`, {});
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ key, archived: false, archivedAt: null, version: 3 });
    expect(await snapshotKeys()).toContain(key);
    expect((await api.get(`${flag(key)}/targeting/production`)).body).toMatchObject({ on: true, version: 2 });
  });

  it('rejects deleting a flag that is not archived with 409, keeping it', async () => {
    const key = await createFlag('live');
    expect((await api.delete(flag(key))).status).toBe(409);
    expect((await api.get(flag(key))).status).toBe(200);
    expect(await snapshotKeys()).toContain(key);
  });

  it('permanently deletes an archived flag with its targeting', async () => {
    const key = await createFlag('deleted');
    await api.post(`${flag(key)}/archive`, {});
    expect((await api.delete(flag(key))).status).toBe(204);
    expect((await api.get(flag(key))).status).toBe(404);
    expect((await api.get(`${flag(key)}/targeting/production`)).status).toBe(404);
    // Its key is free again.
    expect((await api.post(`/projects/${projectKey}/flags`, { key, name: 'Again' })).body).toMatchObject({
      key,
      archived: false,
      version: 1,
    });
  });

  it('lists archived flags only when asked to include them', async () => {
    const live = await createFlag('listed-live');
    const archived = await createFlag('listed-archived');
    await api.post(`${flag(archived)}/archive`, {});
    const keys = async (query = '') =>
      (await api.get<{ key: string }[]>(`/projects/${projectKey}/flags${query}`)).body.map((listed) => listed.key);

    expect(await keys()).toContain(live);
    expect(await keys()).not.toContain(archived);
    expect(await keys('?includeArchived=false')).not.toContain(archived);
    expect(await keys('?includeArchived=true')).toEqual(expect.arrayContaining([live, archived]));
    expect((await api.get(`/projects/${projectKey}/flags?includeArchived=maybe`)).status).toBe(400);
  });

  it('returns 404 for archiving or restoring an unknown flag', async () => {
    expect((await api.post(`${flag('no-such-flag')}/archive`, {})).status).toBe(404);
    expect((await api.post(`${flag('no-such-flag')}/restore`, {})).status).toBe(404);
    expect((await api.delete(flag('no-such-flag'))).status).toBe(404);
  });

  it('changes nothing when archiving an archived flag or restoring a live one', async () => {
    const key = await createFlag('idempotent');
    expect((await api.post(`${flag(key)}/restore`, {})).body).toMatchObject({ archived: false, version: 1 });
    const archived = (await api.post(`${flag(key)}/archive`, {})).body;
    expect((await api.post(`${flag(key)}/archive`, {})).body).toEqual(archived);
  });

  it('rejects edits and targeting changes to an archived flag with 409, so a restore serves what it had', async () => {
    const key = await createFlag('frozen');
    await api.post(`${flag(key)}/archive`, {});
    const edit = await api.patch(flag(key), { version: 2, name: 'Edited' });
    expect(edit.status).toBe(409);
    expect(edit.body.message).toContain('archived');
    expect((await api.patch(`${flag(key)}/targeting/production`, { version: 1, on: true })).status).toBe(409);

    await api.post(`${flag(key)}/restore`, {});
    expect((await api.get(flag(key))).body).toMatchObject({ name: 'Flag', version: 3 });
    expect((await api.get(`${flag(key)}/targeting/production`)).body).toMatchObject({ on: false, version: 1 });
  });

  it('says when a new flag takes the key of an archived flag, which must be restored or deleted first', async () => {
    const key = await createFlag('taken');
    await api.post(`${flag(key)}/archive`, {});
    const created = await api.post(`/projects/${projectKey}/flags`, { key, name: 'Again' });
    expect(created.status).toBe(409);
    expect(created.body.message).toContain('archived');
    expect(created.body.message).toContain('restore');
  });
});
