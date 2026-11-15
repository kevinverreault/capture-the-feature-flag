import type { EnvironmentTelemetry } from '@ctff/evaluation';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { startCore, type RunningCore } from './support/core.js';

const minutes = (n: number) => n * 60_000;
const hours = (n: number) => n * 60 * 60_000;
const days = (n: number) => n * 24 * 60 * 60_000;
/** The start of the minute `ago` ms before now, as Evaluators send it. */
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
  for (const key of flagKeys) await api.post(`/projects/${projectKey}/flags`, { key, name: `Flag ${key}` });
  return { projectKey, development: development.body.sdkKey, production: production.body.sdkKey };
}

function sendCounts(api: ApiClient, sdkKey: string, counts: EnvironmentTelemetry['counts']) {
  return api.post('/evaluator/telemetry', { environments: [{ sdkKey, counts, seenContexts: [] }] });
}

const switchOn = async (api: ApiClient, projectKey: string, flagKey: string, environmentKey: string) => {
  const path = `/projects/${projectKey}/flags/${flagKey}/targeting/${environmentKey}`;
  const current = await api.get(path);
  const response = await api.patch(path, { on: true, version: current.body.version });
  expect(response.status).toBe(200);
};

describe('dashboard', () => {
  let core: RunningCore;
  let api: ApiClient;
  let db: pg.Client;
  beforeAll(async () => {
    core = await startCore();
    api = apiClient(core.baseUrl);
    db = new pg.Client({ connectionString: core.databaseUrl });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
    await core?.stop();
  });

  describe('summary', () => {
    const summary = (projectKey: string) => api.get(`/projects/${projectKey}/dashboard/summary`);

    it('counts the flags, and those on and off in each environment, leaving archived flags out', async () => {
      const { projectKey } = await project(api, ['a-flag', 'b-flag', 'c-flag', 'd-flag']);
      await switchOn(api, projectKey, 'a-flag', 'production');
      await switchOn(api, projectKey, 'b-flag', 'production');
      await switchOn(api, projectKey, 'a-flag', 'development');
      // On in production, but archived: it counts as neither.
      await switchOn(api, projectKey, 'd-flag', 'production');
      await api.post(`/projects/${projectKey}/flags/d-flag/archive`, {});

      const response = await summary(projectKey);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        flagCount: 3,
        archivedFlagCount: 1,
        environments: [
          { environmentKey: 'development', name: 'Dev', on: 1, off: 2 },
          { environmentKey: 'production', name: 'Prod', on: 2, off: 1 },
        ],
      });
    });

    it('counts nothing for a project without flags or environments, and 404s for an unknown project', async () => {
      const projectKey = uniqueKey('empty');
      await api.post('/projects', { key: projectKey, name: 'Empty' });
      expect((await summary(projectKey)).body).toEqual({ flagCount: 0, archivedFlagCount: 0, environments: [] });
      expect((await summary('no-such-project')).status).toBe(404);
    });
  });

  describe('evaluations', () => {
    const evaluations = (projectKey: string, query = '') =>
      api.get(`/projects/${projectKey}/dashboard/evaluations${query}`);
    /** The start of the bucket holding `minute`, of a series starting at `from` with buckets of `bucketMinutes`. */
    const bucketOf = (minute: string, series: { from: string; bucketMinutes: number }) => {
      const size = minutes(series.bucketMinutes);
      const from = Date.parse(series.from);
      return new Date(from + Math.floor((Date.parse(minute) - from) / size) * size).toISOString();
    };

    it('sums the last 24 hours of counts into hourly buckets per flag, environment and variation', async () => {
      const { projectKey, development, production } = await project(api);
      const now = minuteAgo(0);
      const earlier = minuteAgo(hours(5));
      await sendCounts(api, production, [
        { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: now, count: 4 },
        { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: minuteAgo(minutes(1)), count: 1 },
        { flagKey: 'rare-bird-alerts', variationIndex: 1, minute: now, count: 2 },
        { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: earlier, count: 3 },
        // Older than 24 hours: left out.
        { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: minuteAgo(hours(25)), count: 100 },
      ]);
      await sendCounts(api, development, [{ flagKey: 'photo-id-beta', variationIndex: 1, minute: now, count: 7 }]);

      const response = await evaluations(projectKey);
      expect(response.status).toBe(200);
      const series = response.body;
      expect(series).toMatchObject({ range: '24h', bucketMinutes: 60, environmentKey: null });
      // 24 whole hours, the last one the current hour, so the latest counts are in.
      expect(Date.parse(series.to) - Date.parse(series.from)).toBe(hours(24));
      expect(new Date(series.to).getUTCMinutes()).toBe(0);
      expect(Date.parse(series.to)).toBeGreaterThan(Date.now());
      expect(Date.parse(series.to) - hours(1)).toBeLessThanOrEqual(Date.now());

      // The two latest minutes may fall either side of an hour boundary.
      const expected = [
        {
          start: bucketOf(earlier, series),
          flagKey: 'rare-bird-alerts',
          environmentKey: 'production',
          variationIndex: 0,
          count: 3,
        },
        {
          start: bucketOf(minuteAgo(minutes(1)), series),
          flagKey: 'rare-bird-alerts',
          environmentKey: 'production',
          variationIndex: 0,
          count: 1,
        },
        {
          start: bucketOf(now, series),
          flagKey: 'photo-id-beta',
          environmentKey: 'development',
          variationIndex: 1,
          count: 7,
        },
        {
          start: bucketOf(now, series),
          flagKey: 'rare-bird-alerts',
          environmentKey: 'production',
          variationIndex: 0,
          count: 4,
        },
        {
          start: bucketOf(now, series),
          flagKey: 'rare-bird-alerts',
          environmentKey: 'production',
          variationIndex: 1,
          count: 2,
        },
      ];
      const sum = (rows: typeof expected) => {
        const totals = new Map<string, (typeof expected)[number]>();
        for (const row of rows) {
          const key = `${row.start} ${row.environmentKey} ${row.flagKey} ${row.variationIndex}`;
          const total = totals.get(key);
          if (total) total.count += row.count;
          else totals.set(key, { ...row });
        }
        return [...totals.values()];
      };
      expect(new Set(series.counts)).toEqual(new Set(sum(expected)));
      // Oldest first.
      const starts = series.counts.map((row: { start: string }) => row.start);
      expect(starts).toEqual([...starts].sort());
    });

    it('sums the last 7 days into 6-hour buckets, for one environment when asked', async () => {
      const { projectKey, development, production } = await project(api);
      const now = minuteAgo(0);
      const old = minuteAgo(days(6));
      await sendCounts(api, production, [
        { flagKey: 'rare-bird-alerts', variationIndex: 1, minute: old, count: 5 },
        { flagKey: 'rare-bird-alerts', variationIndex: 1, minute: now, count: 1 },
        // Older than 7 days: left out.
        { flagKey: 'rare-bird-alerts', variationIndex: 1, minute: minuteAgo(days(7) + hours(7)), count: 100 },
      ]);
      await sendCounts(api, development, [{ flagKey: 'rare-bird-alerts', variationIndex: 1, minute: now, count: 9 }]);

      const response = await evaluations(projectKey, '?range=7d&environment=production');
      expect(response.status).toBe(200);
      const series = response.body;
      expect(series).toMatchObject({ range: '7d', bucketMinutes: 360, environmentKey: 'production' });
      expect(Date.parse(series.to) - Date.parse(series.from)).toBe(days(7));
      // Buckets start at 00:00, 06:00, 12:00 and 18:00 UTC.
      expect(new Date(series.to).getUTCHours() % 6).toBe(0);
      expect(series.counts).toEqual([
        {
          start: bucketOf(old, series),
          flagKey: 'rare-bird-alerts',
          environmentKey: 'production',
          variationIndex: 1,
          count: 5,
        },
        {
          start: bucketOf(now, series),
          flagKey: 'rare-bird-alerts',
          environmentKey: 'production',
          variationIndex: 1,
          count: 1,
        },
      ]);
    });

    it('rejects an unknown range, and 404s for an unknown project or environment', async () => {
      const { projectKey } = await project(api);
      expect((await evaluations(projectKey, '?range=30d')).status).toBe(400);
      expect((await evaluations(projectKey, '?environment=staging')).status).toBe(404);
      expect((await evaluations('no-such-project')).status).toBe(404);
      expect((await evaluations(projectKey)).body.counts).toEqual([]);
    });
  });

  describe('stale flags', () => {
    const staleFlags = (projectKey: string) => api.get(`/projects/${projectKey}/dashboard/stale-flags`);
    /** Makes the flags of the project look created `ago` ms before now. */
    const backdate = (projectKey: string, flagKeys: string[], ago: number) =>
      db.query(
        `UPDATE flags SET created_at = $3 FROM projects
          WHERE flags.project_id = projects.id AND projects.key = $1 AND flags.key = ANY($2)`,
        [projectKey, flagKeys, new Date(Date.now() - ago)],
      );

    it('lists the flags with no evaluations in any environment for the stale-flag threshold', async () => {
      expect((await api.patch('/settings', { staleFlagThresholdDays: 3 })).status).toBe(200);
      const { projectKey, development, production } = await project(api, [
        'never-evaluated',
        'evaluated-long-ago',
        'evaluated-lately',
        'just-created',
        'archived-long-ago',
      ]);
      await backdate(
        projectKey,
        ['never-evaluated', 'evaluated-long-ago', 'evaluated-lately', 'archived-long-ago'],
        days(10),
      );
      const longAgo = minuteAgo(days(5));
      await sendCounts(api, production, [
        { flagKey: 'evaluated-long-ago', variationIndex: 0, minute: longAgo, count: 1 },
        { flagKey: 'evaluated-lately', variationIndex: 0, minute: longAgo, count: 1 },
      ]);
      // Evaluated lately in one environment only: that is enough.
      await sendCounts(api, development, [
        { flagKey: 'evaluated-lately', variationIndex: 1, minute: minuteAgo(days(1)), count: 1 },
      ]);
      await api.post(`/projects/${projectKey}/flags/archived-long-ago/archive`, {});

      const response = await staleFlags(projectKey);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        thresholdDays: 3,
        // Never evaluated first, then the longest without evaluations.
        flags: [
          {
            key: 'never-evaluated',
            name: 'Flag never-evaluated',
            createdAt: expect.any(String),
            lastEvaluatedAt: null,
          },
          {
            key: 'evaluated-long-ago',
            name: 'Flag evaluated-long-ago',
            createdAt: expect.any(String),
            lastEvaluatedAt: longAgo,
          },
        ],
      });

      // The threshold from Settings applies at once.
      await api.patch('/settings', { staleFlagThresholdDays: 6 });
      const later = await staleFlags(projectKey);
      expect(later.body.thresholdDays).toBe(6);
      expect(later.body.flags.map((flag: { key: string }) => flag.key)).toEqual(['never-evaluated']);
    });

    it('404s for an unknown project', async () => {
      expect((await staleFlags('no-such-project')).status).toBe(404);
    });
  });
});
