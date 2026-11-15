import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

describe('settings', () => {
  let core: RunningCore;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  const defaults = {
    metricRetentionDays: 30,
    seenContextRetentionDays: 30,
    seenContextCap: 1000,
    staleFlagThresholdDays: 7,
  };

  // The tests in this file run in order and share one install's settings.
  it('starts with the defaults', async () => {
    const response = await api.get('/settings');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(defaults);
  });

  it('updates some settings and leaves the others, and keeps them across a restart', async () => {
    const updated = await api.patch('/settings', { seenContextCap: 250, staleFlagThresholdDays: 14 });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ ...defaults, seenContextCap: 250, staleFlagThresholdDays: 14 });
    expect((await api.get('/settings')).body).toEqual(updated.body);

    await core.stop();
    core = await startCore({ databaseUrl: core.databaseUrl });
    api = apiClient(core.baseUrl);
    expect((await api.get('/settings')).body).toEqual(updated.body);

    const restored = await api.patch('/settings', defaults);
    expect(restored.body).toEqual(defaults);
  });

  it.each([
    [{ metricRetentionDays: 0 }, 'metricRetentionDays'],
    [{ seenContextRetentionDays: 1.5 }, 'seenContextRetentionDays'],
    [{ seenContextCap: '1000' }, 'seenContextCap'],
    [{ seenContextCap: 0 }, 'seenContextCap'],
    [{ staleFlagThresholdDays: null }, 'staleFlagThresholdDays'],
    [{ metricRetentionDays: 100_000 }, 'metricRetentionDays'],
    [{ retention: 3 }, 'retention'],
  ])('rejects %j with 400 and changes nothing', async (body, field) => {
    const response = await api.patch('/settings', body);
    expect(response.status).toBe(400);
    expect(Object.keys(response.body.fields)).toEqual([field]);
    expect((await api.get('/settings')).body).toEqual(defaults);
  });
});
