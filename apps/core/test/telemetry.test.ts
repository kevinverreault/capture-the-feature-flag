import type { EnvironmentTelemetry, TelemetryBatch } from '@ctff/evaluation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

const minutes = (n: number) => n * 60_000;
const days = (n: number) => n * 24 * 60 * 60_000;
/** The start of the minute `ago` ms before now, as Evaluators send it. */
/** The moment `ago` ms before now, as an ISO timestamp. */
const at = (ago: number) => new Date(Date.now() - ago).toISOString();
const minuteAgo = (ago: number) => new Date(Math.floor((Date.now() - ago) / 60_000) * 60_000).toISOString();

/** A project with `development` and `production` and the flags given, returning the SDK key of each. */
async function project(
  api: ApiClient,
  flagKeys: string[] = ['rare-bird-alerts', 'photo-id-beta'],
): Promise<{ projectKey: string; development: string; production: string }> {
  const projectKey = uniqueKey('project');
  await api.post('/projects', { key: projectKey, name: 'Project' });
  const development = await api.post(`/projects/${projectKey}/environments`, { key: 'development', name: 'Dev' });
  const production = await api.post(`/projects/${projectKey}/environments`, { key: 'production', name: 'Prod' });
  for (const key of flagKeys) await api.post(`/projects/${projectKey}/flags`, { key, name: key });
  return { projectKey, development: development.body.sdkKey, production: production.body.sdkKey };
}

const send = (api: ApiClient, batch: TelemetryBatch) => api.post('/evaluator/telemetry', batch);
const environment = (sdkKey: string, telemetry: Partial<EnvironmentTelemetry>): EnvironmentTelemetry => ({
  sdkKey,
  counts: [],
  seenContexts: [],
  ...telemetry,
});

describe('evaluation count ingestion', () => {
  let core: RunningCore;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  const counts = (projectKey: string, query = '') => api.get(`/projects/${projectKey}/evaluation-counts${query}`);

  it('stores the counts per flag, environment, variation and minute, adding up what several Evaluators send', async () => {
    const { projectKey, development, production } = await project(api);
    const earlier = minuteAgo(minutes(3));
    const now = minuteAgo(0);
    const first = await send(api, {
      environments: [
        environment(production, {
          counts: [
            { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: earlier, count: 4 },
            { flagKey: 'rare-bird-alerts', variationIndex: 1, minute: earlier, count: 1 },
            { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: now, count: 2 },
          ],
        }),
        environment(development, {
          counts: [{ flagKey: 'photo-id-beta', variationIndex: 1, minute: now, count: 7 }],
        }),
      ],
    });
    expect(first.status).toBe(204);
    // Another Evaluator's batch for the same minute.
    await send(api, {
      environments: [
        environment(production, {
          counts: [{ flagKey: 'rare-bird-alerts', variationIndex: 0, minute: now, count: 3 }],
        }),
      ],
    });

    const response = await counts(projectKey);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { flagKey: 'rare-bird-alerts', environmentKey: 'production', variationIndex: 0, minute: earlier, count: 4 },
      { flagKey: 'rare-bird-alerts', environmentKey: 'production', variationIndex: 1, minute: earlier, count: 1 },
      { flagKey: 'photo-id-beta', environmentKey: 'development', variationIndex: 1, minute: now, count: 7 },
      { flagKey: 'rare-bird-alerts', environmentKey: 'production', variationIndex: 0, minute: now, count: 5 },
    ]);
  });

  it('lists the counts of a time range and one environment', async () => {
    const { projectKey, development, production } = await project(api);
    const bucket = (minute: string) => ({ flagKey: 'rare-bird-alerts', variationIndex: 0, minute, count: 1 });
    const old = minuteAgo(days(2));
    const recent = minuteAgo(minutes(10));
    await send(api, {
      environments: [
        environment(production, { counts: [bucket(old), bucket(recent)] }),
        environment(development, { counts: [bucket(recent)] }),
      ],
    });

    // The last 24 hours unless asked otherwise.
    expect((await counts(projectKey)).body.map((row: { minute: string }) => row.minute)).toEqual([recent, recent]);
    const from = encodeURIComponent(minuteAgo(days(3)));
    const to = encodeURIComponent(minuteAgo(days(1)));
    expect((await counts(projectKey, `?from=${from}&to=${to}`)).body).toEqual([
      { flagKey: 'rare-bird-alerts', environmentKey: 'production', variationIndex: 0, minute: old, count: 1 },
    ]);
    const production7d = await counts(projectKey, `?environment=production&from=${from}`);
    expect(production7d.body.map((row: { minute: string }) => row.minute)).toEqual([old, recent]);

    expect((await counts(projectKey, '?from=yesterday')).status).toBe(400);
    expect((await counts(projectKey, '?environment=staging')).status).toBe(404);
    expect((await counts('no-such-project')).status).toBe(404);
    // At most a week, the dashboard's longest chart.
    const weekAndAMinute = encodeURIComponent(at(days(7) + minutes(1)));
    expect((await counts(projectKey, `?from=${weekAndAMinute}`)).status).toBe(400);
  });

  it('skips counts for unknown SDK keys, flags and variations, and stores the rest', async () => {
    const { projectKey, production } = await project(api, ['rare-bird-alerts']);
    const other = await project(api, ['elsewhere']);
    const now = minuteAgo(0);
    const response = await send(api, {
      environments: [
        environment('ctff-env-deleted', {
          counts: [{ flagKey: 'rare-bird-alerts', variationIndex: 0, minute: now, count: 1 }],
        }),
        environment(production, {
          counts: [
            { flagKey: 'rare-bird-alerts', variationIndex: 1, minute: now, count: 2 },
            { flagKey: 'deleted-flag', variationIndex: 0, minute: now, count: 1 },
            // A flag of another project.
            { flagKey: 'elsewhere', variationIndex: 0, minute: now, count: 1 },
            { flagKey: 'rare-bird-alerts', variationIndex: 2, minute: now, count: 1 },
          ],
        }),
      ],
    });
    expect(response.status).toBe(204);
    expect((await counts(projectKey)).body).toEqual([
      { flagKey: 'rare-bird-alerts', environmentKey: 'production', variationIndex: 1, minute: now, count: 2 },
    ]);
    expect((await counts(other.projectKey)).body).toEqual([]);
  });

  it.each([
    ['no environments list', {}],
    ['a count of zero', { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: minuteAgo(0), count: 0 }],
    ['a fractional count', { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: minuteAgo(0), count: 1.5 }],
    ['a negative variation', { flagKey: 'rare-bird-alerts', variationIndex: -1, minute: minuteAgo(0), count: 1 }],
    ['a minute that is not a timestamp', { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: 'now', count: 1 }],
    ['a missing flag key', { variationIndex: 0, minute: minuteAgo(0), count: 1 }],
  ])('rejects a batch with %s with 400 and stores none of it', async (_case, count) => {
    const { projectKey, production } = await project(api);
    const valid = { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: minuteAgo(0), count: 1 };
    const body =
      'flagKey' in count || 'count' in count
        ? { environments: [environment(production, { counts: [valid, count as never] })] }
        : count;
    expect((await api.post('/evaluator/telemetry', body)).status).toBe(400);
    expect((await counts(projectKey)).body).toEqual([]);
  });

  it('counts a minute in the future, from an Evaluator whose clock runs ahead, in the current minute', async () => {
    const { projectKey, production } = await project(api, ['rare-bird-alerts']);
    const before = minuteAgo(0);
    const ahead = new Date(Date.now() + minutes(90)).toISOString();
    await send(api, {
      environments: [
        environment(production, {
          counts: [{ flagKey: 'rare-bird-alerts', variationIndex: 0, minute: ahead, count: 2 }],
        }),
      ],
    });
    const after = minuteAgo(0);
    const stored = (await counts(projectKey, `?to=${encodeURIComponent(ahead)}`)).body;
    expect(stored).toHaveLength(1);
    expect([before, after]).toContain(stored[0].minute);
  });

  it('stores the rest of a batch when one of its flags is deleted while it arrives', async () => {
    const { projectKey, production } = await project(api, ['rare-bird-alerts', 'short-lived']);
    const minute = minuteAgo(0);
    const batch = {
      environments: [
        environment(production, {
          counts: [
            { flagKey: 'rare-bird-alerts', variationIndex: 0, minute, count: 1 },
            { flagKey: 'short-lived', variationIndex: 0, minute, count: 1 },
          ],
          seenContexts: [{ context: { user_id: 'alice' }, lastSeen: at(0) }],
        }),
      ],
    };
    // Only an archived flag can be deleted.
    await api.post(`/projects/${projectKey}/flags/short-lived/archive`, {});
    const [responses] = await Promise.all([
      Promise.all(Array.from({ length: 20 }, () => send(api, batch))),
      api.delete(`/projects/${projectKey}/flags/short-lived`),
    ]);
    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(204));
    const stored = (await counts(projectKey)).body;
    expect(stored.map((row: { flagKey: string }) => row.flagKey)).toEqual(['rare-bird-alerts']);
    expect(stored[0].count).toBe(20);
  });

  it('deletes the counts of a flag that is deleted', async () => {
    const { projectKey, production } = await project(api, ['short-lived']);
    await send(api, {
      environments: [
        environment(production, {
          counts: [{ flagKey: 'short-lived', variationIndex: 0, minute: minuteAgo(0), count: 1 }],
        }),
      ],
    });
    expect((await counts(projectKey)).body).toHaveLength(1);
    await api.post(`/projects/${projectKey}/flags/short-lived/archive`, {});
    await api.delete(`/projects/${projectKey}/flags/short-lived`);
    expect((await counts(projectKey)).body).toEqual([]);
  });
});

describe('seen context ingestion', () => {
  let core: RunningCore;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  const seenContexts = (projectKey: string, environmentKey = 'production') =>
    api.get(`/projects/${projectKey}/environments/${environmentKey}/seen-contexts`);

  it('records each context once per environment with when it was last seen, most recent first', async () => {
    const { projectKey, development, production } = await project(api);
    await send(api, {
      environments: [
        environment(production, {
          seenContexts: [
            { context: { user_id: 'alice', country: 'ca' }, lastSeen: at(minutes(5)) },
            { context: { user_id: 'bram', country: 'NL' }, lastSeen: at(minutes(4)) },
            { context: { country: 'FR' }, lastSeen: at(minutes(3)) },
            // Another context: alice without a country.
            { context: { user_id: 'alice' }, lastSeen: at(minutes(2)) },
          ],
        }),
        environment(development, { seenContexts: [{ context: { user_id: 'alice' }, lastSeen: at(minutes(1)) }] }),
      ],
    });
    // Another Evaluator saw alice in CA more recently, and bram earlier than already recorded.
    const aliceAgain = at(minutes(1));
    await send(api, {
      environments: [
        environment(production, {
          seenContexts: [
            { context: { user_id: 'alice', country: 'CA' }, lastSeen: aliceAgain },
            { context: { user_id: 'bram', country: 'NL' }, lastSeen: at(minutes(30)) },
          ],
        }),
      ],
    });

    const response = await seenContexts(projectKey);
    expect(response.status).toBe(200);
    expect(response.body.map((entry: { context: object }) => entry.context)).toEqual([
      { user_id: 'alice', country: 'CA' },
      { user_id: 'alice' },
      { country: 'FR' },
      { user_id: 'bram', country: 'NL' },
    ]);
    expect(response.body[0].lastSeen).toBe(aliceAgain);
    expect(Date.parse(response.body[3].lastSeen)).toBeGreaterThan(Date.now() - minutes(5));
    expect((await seenContexts(projectKey, 'development')).body).toHaveLength(1);
    expect((await seenContexts(projectKey, 'staging')).status).toBe(404);
    const newest = await api.get(`/projects/${projectKey}/environments/production/seen-contexts?limit=2`);
    expect(newest.body.map((entry: { context: object }) => entry.context)).toEqual([
      { user_id: 'alice', country: 'CA' },
      { user_id: 'alice' },
    ]);
    expect((await api.get(`/projects/${projectKey}/environments/production/seen-contexts?limit=0`)).status).toBe(400);
  });

  it('skips contexts without attributes, and rejects malformed ones', async () => {
    const { projectKey, production } = await project(api);
    await send(api, { environments: [environment(production, { seenContexts: [{ context: {}, lastSeen: at(0) }] })] });
    expect((await seenContexts(projectKey)).body).toEqual([]);

    for (const context of [{ country: 'Canada' }, { user_id: '' }, { user_id: 7 }, 'alice']) {
      const response = await api.post('/evaluator/telemetry', {
        environments: [environment(production, { seenContexts: [{ context: context as never, lastSeen: at(0) }] })],
      });
      expect(response.status).toBe(400);
    }
  });

  it('keeps only the newest contexts up to the seen-context cap in each environment', async () => {
    const { projectKey, development, production } = await project(api);
    expect((await api.patch('/settings', { seenContextCap: 3 })).status).toBe(200);
    try {
      const users = (ids: string[], ago: number) =>
        ids.map((id, index) => ({ context: { user_id: id }, lastSeen: at(ago - index * 1000) }));
      await send(api, {
        environments: [
          environment(production, { seenContexts: users(['u1', 'u2', 'u3', 'u4'], minutes(10)) }),
          environment(development, { seenContexts: users(['d1', 'd2'], minutes(10)) }),
        ],
      });
      const ids = async (environmentKey = 'production') =>
        (await seenContexts(projectKey, environmentKey)).body.map(
          (entry: { context: { user_id: string } }) => entry.context.user_id,
        );
      expect(await ids()).toEqual(['u4', 'u3', 'u2']);
      expect(await ids('development')).toEqual(['d2', 'd1']);

      // Seeing u2 again makes it the newest; an older context than all kept ones doesn't get in.
      await send(api, {
        environments: [
          environment(production, {
            seenContexts: [
              { context: { user_id: 'u2' }, lastSeen: at(minutes(1)) },
              { context: { user_id: 'u0' }, lastSeen: at(minutes(60)) },
            ],
          }),
        ],
      });
      expect(await ids()).toEqual(['u2', 'u4', 'u3']);
    } finally {
      await api.patch('/settings', { seenContextCap: 1000 });
    }
  });

  it('stores every batch when several Evaluators send to the same environment at once', async () => {
    const { projectKey, production } = await project(api, ['rare-bird-alerts']);
    expect((await api.patch('/settings', { seenContextCap: 5 })).status).toBe(200);
    try {
      const minute = minuteAgo(0);
      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, evaluator) =>
          send(api, {
            environments: [
              environment(production, {
                counts: [{ flagKey: 'rare-bird-alerts', variationIndex: 0, minute, count: 1 }],
                seenContexts: Array.from({ length: 20 }, (_, index) => ({
                  context: { user_id: `u${(evaluator * 7 + index) % 30}` },
                  lastSeen: at(index * 1000),
                })),
              }),
            ],
          }),
        ),
      );
      expect(responses.map((response) => response.status)).toEqual(Array(10).fill(204));
      expect((await api.get(`/projects/${projectKey}/evaluation-counts`)).body[0].count).toBe(10);
      expect((await seenContexts(projectKey)).body).toHaveLength(5);
    } finally {
      await api.patch('/settings', { seenContextCap: 1000 });
    }
  });

  it('accepts a batch as large as an Evaluator sends at its limits', async () => {
    const { projectKey, production } = await project(api);
    const seen = Array.from({ length: 5000 }, (_, index) => ({
      context: { user_id: `birder-with-a-long-identifier-${index}`, country: 'CA' },
      lastSeen: at(index),
    }));
    expect((await send(api, { environments: [environment(production, { seenContexts: seen })] })).status).toBe(204);
    const stored = (await api.get(`/projects/${projectKey}/environments/production/seen-contexts?limit=1000`)).body;
    expect(stored).toHaveLength(1000);
    expect(stored[0].context.user_id).toBe('birder-with-a-long-identifier-0');
  });
});

describe('telemetry retention', () => {
  const seenContexts = (api: ApiClient, projectKey: string) =>
    api.get(`/projects/${projectKey}/environments/production/seen-contexts`);

  /** Sends telemetry 40 days, 2 days and 5 minutes old, and returns the minutes of the last two buckets. */
  async function sendOldAndRecent(api: ApiClient, production: string): Promise<{ lapsed: string; recent: string }> {
    const lapsed = minuteAgo(days(2));
    const recent = minuteAgo(minutes(5));
    const bucket = (minute: string) => ({ flagKey: 'rare-bird-alerts', variationIndex: 0, minute, count: 1 });
    await send(api, {
      environments: [
        environment(production, {
          counts: [bucket(minuteAgo(days(40))), bucket(lapsed), bucket(recent)],
          seenContexts: [
            { context: { user_id: 'gone' }, lastSeen: at(days(40)) },
            { context: { user_id: 'lapsed' }, lastSeen: at(days(2)) },
            { context: { user_id: 'recent' }, lastSeen: at(minutes(5)) },
          ],
        }),
      ],
    });
    return { lapsed, recent };
  }

  /** The minutes of the count buckets of the last 63 days, oldest first, read a week at a time as the API allows. */
  async function minutesOf(api: ApiClient, projectKey: string): Promise<string[]> {
    const now = Date.now();
    const found: string[] = [];
    for (let week = 8; week >= 0; week -= 1) {
      const end = now + minutes(1) - week * days(7);
      const from = encodeURIComponent(new Date(end - days(7)).toISOString());
      const to = encodeURIComponent(new Date(end).toISOString());
      const response = await api.get(`/projects/${projectKey}/evaluation-counts?from=${from}&to=${to}`);
      expect(response.status).toBe(200);
      found.push(...response.body.map((row: { minute: string }) => row.minute));
    }
    return found;
  }
  const usersOf = async (api: ApiClient, projectKey: string) =>
    (await seenContexts(api, projectKey)).body.map((entry: { context: { user_id: string } }) => entry.context.user_id);

  it('regularly deletes count buckets and seen contexts older than their retention', async () => {
    const core = await startCore({ env: { RETENTION_INTERVAL_MS: '200' } });
    try {
      const api = apiClient(core.baseUrl);
      const { projectKey, production } = await project(api);
      const { lapsed, recent } = await sendOldAndRecent(api, production);

      // The defaults keep 30 days.
      await expect.poll(() => minutesOf(api, projectKey), { timeout: 5000 }).toEqual([lapsed, recent]);
      await expect.poll(() => usersOf(api, projectKey), { timeout: 5000 }).toEqual(['recent', 'lapsed']);
    } finally {
      await core.stop();
    }
  });

  it('applies shorter retention and a lower cap as soon as the settings change', async () => {
    // Retention runs once an hour by default, so only the change to the settings can purge here.
    const core = await startCore();
    try {
      const api = apiClient(core.baseUrl);
      const { projectKey, production } = await project(api);
      // Retention runs in the background when Core starts; let it finish before anything is sent.
      await expect
        .poll(() => core.logs.some((entry) => entry['msg'] === 'Retention ran'), { timeout: 5000 })
        .toBe(true);
      const { recent } = await sendOldAndRecent(api, production);
      await send(api, {
        environments: [
          environment(production, { seenContexts: [{ context: { user_id: 'newest' }, lastSeen: at(0) }] }),
        ],
      });
      expect(await minutesOf(api, projectKey)).toHaveLength(3);
      expect(await usersOf(api, projectKey)).toEqual(['newest', 'recent', 'lapsed', 'gone']);

      await api.patch('/settings', { metricRetentionDays: 1 });
      expect(await minutesOf(api, projectKey)).toEqual([recent]);
      // Every change runs all of retention: the context last seen 40 days ago is past the default 30 days.
      expect(await usersOf(api, projectKey)).toEqual(['newest', 'recent', 'lapsed']);

      await api.patch('/settings', { seenContextRetentionDays: 1, seenContextCap: 1 });
      expect(await usersOf(api, projectKey)).toEqual(['newest']);
    } finally {
      await core.stop();
    }
  });
});
