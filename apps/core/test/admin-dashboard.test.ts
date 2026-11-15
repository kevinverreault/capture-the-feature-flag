import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { browser, page, type Browser } from './support/browser.js';
import { startCore, type RunningCore } from './support/core.js';

const days = (n: number) => n * 24 * 60 * 60_000;
const minuteAgo = (ago: number) => new Date(Math.floor((Date.now() - ago) / 60_000) * 60_000).toISOString();
const text = (element: { textContent: string } | null | undefined) => element?.textContent.replace(/\s+/g, ' ').trim();

describe('admin app: dashboard', () => {
  let core: RunningCore;
  let admin: Browser;
  let api: ApiClient;
  let db: pg.Client;
  beforeAll(async () => {
    core = await startCore();
    admin = browser(core.baseUrl);
    api = apiClient(core.baseUrl);
    db = new pg.Client({ connectionString: core.databaseUrl });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
    await core?.stop();
  });

  /** A project with development and production, two flags, and rare-bird-alerts on in production. */
  async function project(): Promise<{ projectKey: string; development: string; production: string }> {
    const projectKey = uniqueKey('dashboard');
    await api.post('/projects', { key: projectKey, name: 'Birdwatch' });
    const development = await api.post(`/projects/${projectKey}/environments`, {
      key: 'development',
      name: 'Development',
    });
    const production = await api.post(`/projects/${projectKey}/environments`, {
      key: 'production',
      name: 'Production',
    });
    await api.post(`/projects/${projectKey}/flags`, { key: 'rare-bird-alerts', name: 'Rare bird alerts' });
    await api.post(`/projects/${projectKey}/flags`, { key: 'photo-id-beta', name: 'Photo ID (beta)' });
    await api.patch(
      `/projects/${projectKey}/flags/rare-bird-alerts/targeting/production`,
      { version: 1, on: true },
      { 'X-CTFF-Actor': 'Dana' },
    );
    return { projectKey, development: development.body.sdkKey, production: production.body.sdkKey };
  }

  it('opens a project on its dashboard, with its flag counts and on/off counts per environment', async () => {
    const { projectKey } = await project();
    const response = await admin.get(`/projects/${projectKey}`);
    expect(response.status).toBe(200);
    const dashboard = await page(response);
    expect(dashboard.querySelector('nav[aria-label="Project"] a[aria-current="page"]')?.textContent).toBe('Dashboard');
    expect(text(dashboard.querySelector('[data-tile="flags"] .tile-value'))).toBe('2');
    const counts = (environment: string) =>
      ['on', 'off'].map((state) =>
        text(dashboard.querySelector(`[data-environment="${environment}"] [data-state="${state}"]`)),
      );
    expect(counts('development')).toEqual(['0', '2']);
    expect(counts('production')).toEqual(['1', '1']);
  });

  it('charts the evaluations over 24 hours or 7 days, of every environment or one', async () => {
    const { projectKey, development, production } = await project();
    await api.post('/evaluator/telemetry', {
      environments: [
        {
          sdkKey: production,
          counts: [
            { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: minuteAgo(0), count: 30 },
            { flagKey: 'rare-bird-alerts', variationIndex: 1, minute: minuteAgo(0), count: 12 },
            { flagKey: 'rare-bird-alerts', variationIndex: 0, minute: minuteAgo(days(3)), count: 1000 },
          ],
          seenContexts: [],
        },
        {
          sdkKey: development,
          counts: [{ flagKey: 'photo-id-beta', variationIndex: 1, minute: minuteAgo(0), count: 5 }],
          seenContexts: [],
        },
      ],
    });

    const total = async (query: string) => {
      const dashboard = await page(await admin.get(`/projects/${projectKey}${query}`));
      return dashboard.querySelector('.hero')?.getAttribute('data-total');
    };
    expect(await total('')).toBe('47');
    expect(await total('?range=7d')).toBe('1047');
    expect(await total('?range=7d&environment=production')).toBe('1042');
    expect(await total('?environment=development')).toBe('5');
    // An unknown environment or range is no filter.
    expect(await total('?range=30d&environment=staging')).toBe('47');

    const dashboard = await page(await admin.get(`/projects/${projectKey}`));
    // Every hour of the last 24 has its column.
    expect(dashboard.querySelectorAll('.timeline .columns > li')).toHaveLength(24);
    const bars = dashboard.querySelectorAll('.flag-evaluations .bars > li');
    expect(bars.map((bar) => bar.getAttribute('data-flag'))).toEqual(['rare-bird-alerts', 'photo-id-beta']);
    expect(bars[0]?.querySelector('.track')?.getAttribute('aria-label')).toBe('Rare bird alerts: 30 true, 12 false');
    // The table view has every flag per environment and variation.
    const rows = dashboard
      .querySelectorAll('.flag-evaluations table tbody tr')
      .map((row) => row.querySelectorAll('th, td').map((cell) => text(cell)));
    expect(rows).toEqual([
      ['Photo ID (beta)', 'development', '0', '5', '5'],
      ['Rare bird alerts', 'production', '30', '12', '42'],
    ]);
    const week = await page(await admin.get(`/projects/${projectKey}?range=7d`));
    expect(week.querySelectorAll('.timeline .columns > li')).toHaveLength(28);
    expect(week.querySelector('select[name="range"] option[selected]')?.getAttribute('value')).toBe('7d');
  });

  it('says so when there were no evaluations', async () => {
    const { projectKey } = await project();
    const dashboard = await page(await admin.get(`/projects/${projectKey}`));
    expect(dashboard.querySelector('.timeline')).toBeNull();
    expect(text(dashboard.querySelector('[aria-labelledby="evaluations"]'))).toContain(
      'No evaluations in the last 24 hours',
    );
  });

  it('lists the recent changes with their actor, linking to the flag changed', async () => {
    const { projectKey } = await project();
    const dashboard = await page(await admin.get(`/projects/${projectKey}`));
    const changes = dashboard.querySelectorAll('.recent-changes > li');
    // Newest first: the targeting switch, then the flags and environments created.
    expect(text(changes[0])).toContain('Updated targeting of rare-bird-alerts in production');
    expect(text(changes[0])).toContain('by Dana');
    expect(changes[0]?.querySelector('time')).not.toBeNull();
    expect(changes[0]?.querySelector('a')?.getAttribute('href')).toBe(
      `/projects/${projectKey}/flags/rare-bird-alerts?environment=production`,
    );
    expect(text(changes[1])).toContain('Created flag photo-id-beta');
    expect(changes[1]?.querySelector('a')?.getAttribute('href')).toBe(`/projects/${projectKey}/flags/photo-id-beta`);
    expect(text(changes[1])).toContain('by anonymous');
  });

  it('lists the stale flags with the threshold from Settings', async () => {
    const { projectKey, production } = await project();
    await db.query(
      `UPDATE flags SET created_at = $2 FROM projects WHERE flags.project_id = projects.id AND projects.key = $1`,
      [projectKey, new Date(Date.now() - days(30))],
    );
    await api.post('/evaluator/telemetry', {
      environments: [
        {
          sdkKey: production,
          counts: [{ flagKey: 'rare-bird-alerts', variationIndex: 0, minute: minuteAgo(days(1)), count: 1 }],
          seenContexts: [],
        },
      ],
    });
    const dashboard = await page(await admin.get(`/projects/${projectKey}`));
    const section = dashboard.querySelector('[aria-labelledby="stale-flags"]');
    expect(text(section?.querySelector('.stale-threshold'))).toContain('for 7 days');
    const stale = section?.querySelectorAll('.stale-list > li') ?? [];
    expect(stale.map((item) => item.getAttribute('data-flag'))).toEqual(['photo-id-beta']);
    expect(text(stale[0])).toContain('No evaluations in the kept telemetry');
    expect(stale[0]?.querySelector('a')?.getAttribute('href')).toBe(`/projects/${projectKey}/flags/photo-id-beta`);
  });

  it('answers a project that does not exist with 404', async () => {
    const response = await admin.get('/projects/no-such-project');
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('There is no project no-such-project');
  });
});
