import type { HTMLElement } from 'node-html-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { browser, cookiesSet, page, type Browser } from './support/browser.js';
import { startCore, type RunningCore } from './support/core.js';

/** The rows of an audit entry's table of changes, as the text of their cells. */
function changeRows(entry: HTMLElement | undefined): string[][] {
  return (entry?.querySelectorAll('.audit-changes tbody tr') ?? []).map((row) =>
    row.querySelectorAll('th, td').map((cell) => cell.textContent.trim()),
  );
}

describe('admin app: audit', () => {
  let core: RunningCore;
  let admin: Browser;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    admin = browser(core.baseUrl);
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  async function project(): Promise<string> {
    const key = uniqueKey('audit');
    await api.post('/projects', { key, name: 'Audit' });
    await api.post(`/projects/${key}/environments`, { key: 'production', name: 'Production' });
    return key;
  }

  async function actors(projectKey: string): Promise<string[]> {
    const response = await api.get(`/audit-entries?projectKey=${projectKey}`);
    return response.body.entries.map((entry: { actor: string }) => entry.actor);
  }

  it('attributes changes to the display name the admin sets, until it is cleared', async () => {
    const projectKey = await project();
    const saved = await admin.post('/display-name', { name: 'Zoë Ørn', returnTo: `/projects/${projectKey}/flags` });
    expect(saved.status).toBe(303);
    expect(saved.headers.get('location')).toBe(`/projects/${projectKey}/flags`);
    const cookie = cookiesSet(saved);

    const form = await page(await admin.get('/display-name', cookie));
    expect(form.querySelector('input[name="name"]')?.getAttribute('value')).toBe('Zoë Ørn');
    const header = await page(await admin.get(`/projects/${projectKey}/flags`, cookie));
    expect(header.querySelector('.app-header')?.textContent).toContain('Zoë Ørn');

    await admin.post(`/projects/${projectKey}/new-flag`, { key: 'kill-switch', name: 'Kill switch' }, cookie);
    const cleared = cookiesSet(await admin.post('/display-name', { name: '' }, cookie));
    await admin.post(`/projects/${projectKey}/new-flag`, { key: 'other-flag', name: 'Other' }, cleared);

    expect((await actors(projectKey)).slice(0, 2)).toEqual(['anonymous', 'Zoë Ørn']);
  });

  it('lists the project’s audit entries with who, when and what changed', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'Kill' }, { 'x-ctff-actor': 'Ada' });
    await api.patch(`/projects/${projectKey}/flags/kill-switch`, { version: 1, name: 'Kill switch' });
    await api.patch(`/projects/${projectKey}/flags/kill-switch/targeting/production`, { version: 1, on: true });

    const response = await admin.get(`/projects/${projectKey}/audit`);
    expect(response.status).toBe(200);
    const log = await page(response);
    const rows = log.querySelectorAll('[data-audit-entry]');
    expect(rows.map((row) => row.querySelector('.audit-summary')?.textContent.trim())).toEqual([
      'Updated targeting of kill-switch in production',
      'Updated flag kill-switch',
      'Created flag kill-switch',
      'Created environment production',
      `Created project ${projectKey}`,
    ]);
    expect(rows[2]?.querySelector('.audit-actor')?.textContent).toContain('Ada');
    expect(rows[0]?.querySelector('time')?.getAttribute('datetime')).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(changeRows(rows[0])).toEqual([
      ['Targeting', 'off', 'on'],
      ['Version', '1', '2'],
    ]);
    expect(changeRows(rows[1])).toEqual([
      ['Name', 'Kill', 'Kill switch'],
      ['Version', '1', '2'],
    ]);
    // A create shows what was created.
    expect(changeRows(rows[2])).toContainEqual(['Name', 'Kill']);
  });

  it('pages through a long audit log', async () => {
    const projectKey = await project();
    for (let index = 0; index < 30; index += 1) await api.patch(`/projects/${projectKey}`, { name: `Name ${index}` });

    const first = await page(await admin.get(`/projects/${projectKey}/audit`));
    expect(first.querySelectorAll('[data-audit-entry]')).toHaveLength(25);
    const older = first.querySelector('a[rel="next"]')?.getAttribute('href') ?? '';
    const second = await page(await admin.get(older));
    expect(second.querySelectorAll('[data-audit-entry]')).toHaveLength(7);
    expect(second.querySelector('a[rel="next"]')).toBeNull();
  });

  it('shows a flag’s own audit entries on its detail page', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'Kill switch' });
    await api.post(`/projects/${projectKey}/flags`, { key: 'other-flag', name: 'Other' });
    await api.patch(`/projects/${projectKey}/flags/kill-switch/targeting/production`, { version: 1, on: true });

    const detail = await page(await admin.get(`/projects/${projectKey}/flags/kill-switch`));
    const history = detail.querySelector('#audit-entries')?.parentNode;
    expect(
      history?.querySelectorAll('[data-audit-entry] .audit-summary').map((summary) => summary.textContent.trim()),
    ).toEqual(['Updated targeting of kill-switch in production', 'Created flag kill-switch']);
  });

  it('has the audit log in the project navigation', async () => {
    const projectKey = await project();
    const flags = await page(await admin.get(`/projects/${projectKey}/flags`));
    expect(flags.querySelector(`nav a[href="/projects/${projectKey}/audit"]`)?.textContent.trim()).toBe('Audit log');
  });

  it('keeps the audit log of a deleted flag, named by its key', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'Kill switch' });
    await api.post(`/projects/${projectKey}/flags/kill-switch/archive`, {});
    await api.delete(`/projects/${projectKey}/flags/kill-switch`);

    const response = await admin.get(`/projects/${projectKey}/audit?flag=kill-switch`);
    expect(response.status).toBe(200);
    const log = await page(response);
    expect(log.querySelector('#audit-heading')?.textContent.trim()).toBe('Audit log of kill-switch');
    expect(
      log.querySelectorAll('[data-audit-entry] .audit-summary').map((summary) => summary.textContent.trim()),
    ).toEqual(['Deleted flag kill-switch', 'Archived flag kill-switch', 'Created flag kill-switch']);
  });
});
