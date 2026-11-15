import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey } from './support/api.js';
import { createDatabase, startCore, type RunningCore } from './support/core.js';

describe('health', () => {
  let core: RunningCore;
  beforeAll(async () => {
    core = await startCore();
  });
  afterAll(() => core?.stop());

  it('applies its migrations on start and reports ready', async () => {
    const ready = await fetch(`${core.baseUrl}/health/ready`);
    expect(ready.status).toBe(200);
  });

  it('reports live', async () => {
    const live = await fetch(`${core.baseUrl}/health/live`);
    expect(live.status).toBe(200);
  });

  it('writes JSON logs to stdout', () => {
    expect(core.logs.length).toBeGreaterThan(0);
    expect(core.logs.every((entry) => !('unparsed' in entry))).toBe(true);
  });
});

describe('migrations', () => {
  it('lets several Cores start on one database at once, and restart on it, keeping its data', async () => {
    const databaseUrl = await createDatabase();
    const [first, second] = await Promise.all([startCore({ databaseUrl }), startCore({ databaseUrl })]);
    const replicas = [first, second];
    const key = uniqueKey('survivor');
    try {
      for (const replica of replicas) {
        expect((await fetch(`${replica.baseUrl}/health/ready`)).status).toBe(200);
      }
      expect((await apiClient(first.baseUrl).post('/projects', { key, name: 'Survivor' })).status).toBe(201);
    } finally {
      await Promise.all(replicas.map((replica) => replica.stop()));
    }

    const restarted = await startCore({ databaseUrl });
    try {
      expect((await apiClient(restarted.baseUrl).get(`/projects/${key}`)).status).toBe(200);
    } finally {
      await restarted.stop();
    }
  });
});
