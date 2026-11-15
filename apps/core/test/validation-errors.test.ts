import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

/**
 * A 400 lists every message in `message`, as Nest does, and also groups them by the property they are about in
 * `fields`, so a client (the admin app's forms) can show each next to its input without parsing the text.
 */
describe('validation errors', () => {
  let core: RunningCore;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  it('group the messages by property', async () => {
    const response = await api.post('/projects', { key: 'Not A Key', name: ' ', color: 'red' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      fields: {
        key: [expect.stringContaining('lowercase kebab-case')],
        name: [expect.stringContaining('blank')],
        color: ['property color should not exist'],
      },
    });
    const { message, fields } = response.body as { message: string[]; fields: Record<string, string[]> };
    expect([...message].sort()).toEqual(Object.values(fields).flat().sort());
  });

  it('name the immutable key a change was refused for', async () => {
    const project = uniqueKey('immutable');
    await api.post('/projects', { key: project, name: 'Immutable' });
    const environments = `/projects/${project}/environments`;
    await api.post(environments, { key: 'production', name: 'Production' });

    const key = await api.patch(`/projects/${project}`, { key: 'moved' });
    expect(key.status).toBe(400);
    expect(key.body).toMatchObject({ fields: { key: ['project key is immutable and cannot be changed'] } });

    const sdkKey = await api.patch(`${environments}/production`, { sdkKey: 'ctff-env-chosen' });
    expect(sdkKey.status).toBe(400);
    expect(sdkKey.body).toMatchObject({ fields: { sdkKey: ['SDK key is immutable and cannot be changed'] } });
  });
});
