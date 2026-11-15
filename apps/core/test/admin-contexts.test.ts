import type { Context } from '@ctff/evaluation';
import { type HTMLElement, type Node, TextNode } from 'node-html-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { browser, page, type Browser } from './support/browser.js';
import { startCore, type RunningCore } from './support/core.js';

/** The text of an element: each of its text nodes, trimmed and joined by a space. */
function words(node: Node): string {
  if (node instanceof TextNode) return node.text.replace(/\s+/g, ' ').trim();
  return node.childNodes
    .map(words)
    .filter((text) => text !== '')
    .join(' ');
}

/** The text of each cell of each body row of a table. */
function rows(table: HTMLElement | null | undefined): string[][] {
  return (table?.querySelectorAll('tbody tr') ?? []).map((row) => row.querySelectorAll('th, td').map(words));
}

describe('admin app: contexts', () => {
  let core: RunningCore;
  let admin: Browser;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    admin = browser(core.baseUrl);
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  /** A project with production and staging, two flags, and contexts seen in production. */
  async function project(): Promise<string> {
    const key = uniqueKey('contexts');
    await api.post('/projects', { key, name: 'Contexts' });
    const production = await api.post(`/projects/${key}/environments`, { key: 'production', name: 'Production' });
    await api.post(`/projects/${key}/environments`, { key: 'staging', name: 'Staging' });
    await api.post(`/projects/${key}/flags`, { key: 'rare-bird-alerts', name: 'Rare bird alerts' });
    await api.post(`/projects/${key}/flags`, { key: 'kill-switch', name: 'Kill switch' });
    await api.patch(`/projects/${key}/flags/rare-bird-alerts/targeting/production`, {
      version: 1,
      on: true,
      defaultVariation: 1,
      rules: [{ attribute: 'country', operator: 'in', values: ['CA'], variation: 0 }],
    });
    const seen: [Context, number][] = [
      [{ user_id: 'alice', country: 'CA' }, 30],
      [{ user_id: 'bob', country: 'US' }, 20],
      [{ country: 'FR' }, 10],
    ];
    await api.post('/evaluator/telemetry', {
      environments: [
        {
          sdkKey: production.body.sdkKey,
          counts: [],
          seenContexts: seen.map(([context, ago]) => ({
            context,
            lastSeen: new Date(Date.now() - ago * 1000).toISOString(),
          })),
        },
      ],
    });
    return key;
  }

  it('lists the built-in context attributes, read-only', async () => {
    const response = await admin.get('/context-attributes');
    expect(response.status).toBe(200);
    const html = await page(response);
    const table = html.querySelector('table.context-attributes');
    expect(rows(table).map((row) => row.slice(0, 3))).toEqual([
      ['User ID Built-in user_id', 'String', expect.any(String)],
      ['Country Built-in country', 'ISO 3166-1 alpha-2 country code', expect.any(String)],
    ]);
    expect(html.querySelector('main form')).toBeNull();
    expect(html.querySelector('.app-header a[href="/context-attributes"]')).not.toBeNull();
  });

  it('lists the seen contexts of the first environment, newest first, each selecting it', async () => {
    const projectKey = await project();
    const response = await admin.get(`/projects/${projectKey}/contexts`);
    expect(response.status).toBe(200);
    const html = await page(response);
    expect(html.querySelector(`nav a[href="/projects/${projectKey}/contexts"]`)?.getAttribute('aria-current')).toBe(
      'page',
    );
    expect(html.querySelector('select[name="environment"] option[selected]')?.getAttribute('value')).toBe('production');
    const table = html.querySelector('table.seen-contexts');
    expect(rows(table).map((row) => row.slice(0, 2))).toEqual([
      ['—', 'FR'],
      ['bob', 'US'],
      ['alice', 'CA'],
    ]);
    expect(table?.querySelector('tbody tr a')?.getAttribute('href')).toBe(
      `/projects/${projectKey}/contexts?environment=production&country=FR`,
    );
    // Nothing is selected yet.
    expect(html.querySelector('table.context-flags')).toBeNull();

    const staging = await page(await admin.get(`/projects/${projectKey}/contexts?environment=staging`));
    expect(staging.querySelector('table.seen-contexts')).toBeNull();
    expect(staging.querySelector('.seen-contexts-empty')?.textContent).toContain('No contexts');
  });

  it('searches the seen contexts by user ID', async () => {
    const projectKey = await project();
    const html = await page(await admin.get(`/projects/${projectKey}/contexts?environment=production&search=AL`));
    expect(rows(html.querySelector('table.seen-contexts')).map((row) => row[0])).toEqual(['alice']);
    expect(html.querySelector('input[name="search"]')?.getAttribute('value')).toBe('AL');
  });

  it('shows what every flag serves the selected context, each linking to the flag', async () => {
    const projectKey = await project();
    const response = await admin.get(
      `/projects/${projectKey}/contexts?environment=production&user_id=alice&country=CA`,
    );
    expect(response.status).toBe(200);
    const html = await page(response);
    const table = html.querySelector('table.context-flags');
    expect(rows(table)).toEqual([
      ['Kill switch kill-switch', 'false', 'Targeting off'],
      ['Rare bird alerts rare-bird-alerts', 'true', 'Rule 1 matched'],
    ]);
    expect(table?.querySelectorAll('tbody a').map((link) => link.getAttribute('href'))).toEqual([
      `/projects/${projectKey}/flags/kill-switch?environment=production`,
      `/projects/${projectKey}/flags/rare-bird-alerts?environment=production`,
    ]);
    expect(html.querySelector('table.seen-contexts tr[aria-current]')?.textContent).toContain('alice');

    const elsewhere = await page(
      await admin.get(`/projects/${projectKey}/contexts?environment=staging&user_id=alice&country=CA`),
    );
    expect(rows(elsewhere.querySelector('table.context-flags')).map((row) => row[2])).toEqual([
      'Targeting off',
      'Targeting off',
    ]);
  });

  it('explains a malformed context, an unknown environment and an unknown project', async () => {
    const projectKey = await project();
    const malformed = await admin.get(`/projects/${projectKey}/contexts?environment=production&country=Canada`);
    expect(malformed.status).toBe(400);
    expect((await page(malformed)).querySelector('[role="alert"]')?.textContent).toContain('country');

    const environment = await admin.get(`/projects/${projectKey}/contexts?environment=qa`);
    expect(environment.status).toBe(404);
    expect(await environment.text()).toContain('There is no environment qa');

    expect((await admin.get('/projects/no-such-project/contexts')).status).toBe(404);
  });

  it('says how to start when the project has no environments', async () => {
    const projectKey = uniqueKey('empty');
    await api.post('/projects', { key: projectKey, name: 'Empty' });
    const html = await page(await admin.get(`/projects/${projectKey}/contexts`));
    expect(html.querySelector(`main a[href="/projects/${projectKey}/environments"]`)).not.toBeNull();
  });
});
