import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient } from './support/api.js';
import { createDatabase, startCore, type RunningCore } from './support/core.js';

const seeded = { env: { SEED_DEMO: 'true' } };

describe('the demo seed', () => {
  let databaseUrl: string;
  let core: RunningCore;
  beforeAll(async () => {
    databaseUrl = await createDatabase();
    core = await startCore({ databaseUrl, ...seeded });
  });
  afterAll(() => core?.stop());

  it('creates the birdwatch project with its environments on an empty database, before Core is ready', async () => {
    const api = apiClient(core.baseUrl);
    const projects = await api.get('/projects');
    expect(projects.body.map((project: { key: string }) => project.key)).toEqual(['birdwatch']);
    const environments = await api.get('/projects/birdwatch/environments');
    expect(environments.body.map((environment: { key: string }) => environment.key)).toEqual([
      'development',
      'production',
    ]);
  });

  it('creates the three demo flags', async () => {
    const flags = await apiClient(core.baseUrl).get('/projects/birdwatch/flags');
    expect(flags.body.map((flag: { key: string }) => flag.key).sort()).toEqual([
      'new-sighting-form',
      'photo-id-beta',
      'rare-bird-alerts',
    ]);
  });

  it('switches the new-sighting-form kill switch on in every environment, serving true', async () => {
    const targeting = await apiClient(core.baseUrl).get('/projects/birdwatch/flags/new-sighting-form/targeting');
    expect(targeting.body).toHaveLength(2);
    for (const environment of targeting.body) {
      expect(environment).toMatchObject({ on: true, defaultVariation: 0, individualTargets: [], rules: [] });
    }
  });

  it('records its changes in the audit log as the seed', async () => {
    const entries = await apiClient(core.baseUrl).get('/audit-entries?projectKey=birdwatch&limit=200');
    expect(entries.body.entries.length).toBeGreaterThan(0);
    expect(new Set(entries.body.entries.map((entry: { actor: string }) => entry.actor))).toEqual(new Set(['seed']));
  });

  it('is a no-op when Core starts again', async () => {
    const before = await demoState(core.baseUrl);
    await core.stop();
    core = await startCore({ databaseUrl, ...seeded });
    expect(await demoState(core.baseUrl)).toEqual(before);
  });
});

describe('the demo seed on a database that was never seeded', () => {
  it('seeds the demo next to the projects already there', async () => {
    const databaseUrl = await createDatabase();
    const unseeded = await startCore({ databaseUrl });
    try {
      await apiClient(unseeded.baseUrl).post('/projects', { key: 'mine', name: 'Mine' });
    } finally {
      await unseeded.stop();
    }
    const core = await startCore({ databaseUrl, ...seeded });
    try {
      const projects = await apiClient(core.baseUrl).get('/projects');
      expect(projects.body.map((project: { key: string }) => project.key)).toEqual(['birdwatch', 'mine']);
    } finally {
      await core.stop();
    }
  });

  it('finishes a seed that was interrupted halfway', async () => {
    const databaseUrl = await createDatabase();
    // What a Core killed during its seed leaves behind: the project and its first environment.
    const unseeded = await startCore({ databaseUrl });
    try {
      const api = apiClient(unseeded.baseUrl);
      await api.post('/projects', { key: 'birdwatch', name: 'Birdwatch' });
      await api.post('/projects/birdwatch/environments', { key: 'development', name: 'Development' });
    } finally {
      await unseeded.stop();
    }
    const core = await startCore({ databaseUrl, ...seeded });
    try {
      const api = apiClient(core.baseUrl);
      const environments = await api.get('/projects/birdwatch/environments');
      expect(environments.body.map((environment: { key: string }) => environment.key)).toEqual([
        'development',
        'production',
      ]);
      expect((await api.get('/projects/birdwatch/flags')).body).toHaveLength(3);
      const targeting = await api.get('/projects/birdwatch/flags/new-sighting-form/targeting');
      expect(targeting.body.map((environment: { on: boolean }) => environment.on)).toEqual([true, true]);
    } finally {
      await core.stop();
    }
  });
});

describe('the demo seed once it has completed', () => {
  it('does not bring back a demo project that was deleted', async () => {
    const databaseUrl = await createDatabase();
    const first = await startCore({ databaseUrl, ...seeded });
    try {
      expect((await apiClient(first.baseUrl).delete('/projects/birdwatch')).status).toBe(204);
    } finally {
      await first.stop();
    }
    const core = await startCore({ databaseUrl, ...seeded });
    try {
      expect((await apiClient(core.baseUrl).get('/projects')).body).toEqual([]);
    } finally {
      await core.stop();
    }
  });
});

describe('the demo seed with several Cores starting at once', () => {
  it('seeds the empty database once', async () => {
    const databaseUrl = await createDatabase();
    const [first, second] = await Promise.all([
      startCore({ databaseUrl, ...seeded }),
      startCore({ databaseUrl, ...seeded }),
    ]);
    const replicas = [first, second];
    try {
      const api = apiClient(first.baseUrl);
      expect((await api.get('/projects')).body).toHaveLength(1);
      expect((await api.get('/projects/birdwatch/flags')).body).toHaveLength(3);
      const entries = await api.get('/audit-entries?projectKey=birdwatch&limit=200');
      expect(entries.body.entries.filter((entry: { action: string }) => entry.action === 'create')).toHaveLength(
        1 + 2 + 3,
      );
    } finally {
      await Promise.all(replicas.map((replica) => replica.stop()));
    }
  });
});

/** Everything the seed creates, as the API shows it, with the audit entries recorded for it. */
async function demoState(baseUrl: string): Promise<unknown> {
  const api = apiClient(baseUrl);
  return {
    projects: (await api.get('/projects')).body,
    environments: (await api.get('/projects/birdwatch/environments')).body,
    flags: (await api.get('/projects/birdwatch/flags')).body,
    targeting: await Promise.all(
      ['new-sighting-form', 'rare-bird-alerts', 'photo-id-beta'].map(
        async (flag) => (await api.get(`/projects/birdwatch/flags/${flag}/targeting`)).body,
      ),
    ),
    audit: (await api.get('/audit-entries?projectKey=birdwatch&limit=200')).body,
  };
}
