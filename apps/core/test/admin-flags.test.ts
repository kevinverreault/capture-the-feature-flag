import type { HTMLElement } from 'node-html-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { browser, page, type Browser } from './support/browser.js';
import { startCore, type RunningCore } from './support/core.js';

/** The flag list's rows: each flag key with the on/off state shown for each environment. */
function listedFlags(list: HTMLElement): { key: string; states: Record<string, string> }[] {
  return list.querySelectorAll('tr[data-flag]').map((row) => ({
    key: row.getAttribute('data-flag') ?? '',
    states: Object.fromEntries(
      row
        .querySelectorAll('[data-environment]')
        .map((cell) => [cell.getAttribute('data-environment') ?? '', cell.textContent.trim()]),
    ),
  }));
}

describe('admin app: flags', () => {
  let core: RunningCore;
  let admin: Browser;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    admin = browser(core.baseUrl);
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  /** A project with the development and production environments. */
  async function project(): Promise<string> {
    const key = uniqueKey('flags');
    await api.post('/projects', { key, name: 'Flags' });
    await api.post(`/projects/${key}/environments`, { key: 'development', name: 'Development' });
    await api.post(`/projects/${key}/environments`, { key: 'production', name: 'Production' });
    return key;
  }

  it('lists every flag of the project with its targeting on or off in each environment', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'rare-bird-alerts', name: 'Rare bird alerts' });
    await api.post(`/projects/${projectKey}/flags`, { key: 'new-sighting-form', name: 'New sighting form' });
    await api.patch(`/projects/${projectKey}/flags/rare-bird-alerts/targeting/production`, { version: 1, on: true });

    const response = await admin.get(`/projects/${projectKey}/flags`);
    expect(response.status).toBe(200);
    const list = await page(response);
    expect(listedFlags(list)).toEqual([
      { key: 'new-sighting-form', states: { development: 'Off', production: 'Off' } },
      { key: 'rare-bird-alerts', states: { development: 'Off', production: 'On' } },
    ]);
    expect(list.querySelector(`a[href="/projects/${projectKey}/flags/rare-bird-alerts"]`)?.textContent).toContain(
      'Rare bird alerts',
    );
  });

  it('finds flags by key or name, and filters them by tag', async () => {
    const projectKey = await project();
    const flags = `/projects/${projectKey}/flags`;
    await api.post(flags, { key: 'rare-bird-alerts', name: 'Rare bird alerts', tags: ['alerts', 'birdwatch'] });
    await api.post(flags, { key: 'new-sighting-form', name: 'New sighting form', tags: ['birdwatch'] });
    await api.post(flags, { key: 'photo-id-beta', name: 'Photo ID (beta)' });
    const keys = async (query: string) =>
      listedFlags(await page(await admin.get(`${flags}?${query}`))).map((f) => f.key);

    expect(await keys('search=SIGHTING')).toEqual(['new-sighting-form']);
    expect(await keys('search=photo-id')).toEqual(['photo-id-beta']);
    expect(await keys('tag=birdwatch')).toEqual(['new-sighting-form', 'rare-bird-alerts']);
    expect(await keys('search=rare&tag=birdwatch')).toEqual(['rare-bird-alerts']);
    expect(await keys('search=owl')).toEqual([]);

    // The tag filter offers every tag of the project's flags, and keeps the chosen one.
    const filtered = await page(await admin.get(`${flags}?tag=alerts`));
    const options = filtered.querySelectorAll('select[name="tag"] option');
    expect(options.map((option) => option.getAttribute('value'))).toEqual(['', 'alerts', 'birdwatch']);
    expect(filtered.querySelector('select[name="tag"] option[selected]')?.getAttribute('value')).toBe('alerts');
  });

  it('creates a flag, which starts off in every environment', async () => {
    const projectKey = await project();
    const created = await admin.post(`/projects/${projectKey}/new-flag`, {
      key: 'rare-bird-alerts',
      name: 'Rare bird alerts',
      description: 'Banner for rare sightings nearby',
      tags: 'alerts, birdwatch',
    });
    expect(created.status).toBe(303);
    expect(created.headers.get('location')).toBe(`/projects/${projectKey}/flags/rare-bird-alerts`);
    expect((await api.get(`/projects/${projectKey}/flags/rare-bird-alerts`)).body).toMatchObject({
      key: 'rare-bird-alerts',
      name: 'Rare bird alerts',
      description: 'Banner for rare sightings nearby',
      tags: ['alerts', 'birdwatch'],
    });

    const list = await page(await admin.get(`/projects/${projectKey}/flags`));
    expect(listedFlags(list)).toEqual([{ key: 'rare-bird-alerts', states: { development: 'Off', production: 'Off' } }]);
  });

  it('creates a flag without a description or tags', async () => {
    const projectKey = await project();
    const created = await admin.post(`/projects/${projectKey}/new-flag`, { key: 'plain', name: 'Plain', tags: ' ' });
    expect(created.status).toBe(303);
    expect((await api.get(`/projects/${projectKey}/flags/plain`)).body).toMatchObject({ description: '', tags: [] });
  });

  it("shows the API's validation errors on the create form, keeping what was typed", async () => {
    const projectKey = await project();
    const response = await admin.post(`/projects/${projectKey}/new-flag`, {
      key: 'Rare Bird',
      name: 'Rare bird alerts',
      description: 'Kept',
      tags: 'alerts',
    });
    expect(response.status).toBe(400);
    const form = await page(response);
    expect(form.textContent).toContain('flag key must be lowercase kebab-case');
    expect(form.querySelector('input[name="key"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(form.querySelector('input[name="key"]')?.getAttribute('value')).toBe('Rare Bird');
    expect(form.querySelector('input[name="name"]')?.getAttribute('value')).toBe('Rare bird alerts');
    expect(form.querySelector('textarea[name="description"]')?.textContent).toBe('Kept');
    expect(form.querySelector('input[name="tags"]')?.getAttribute('value')).toBe('alerts');
  });

  it('shows a flag key already used in the project as an error on the key', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'taken', name: 'Taken' });
    const response = await admin.post(`/projects/${projectKey}/new-flag`, { key: 'taken', name: 'Again' });
    expect(response.status).toBe(409);
    const form = await page(response);
    expect(form.querySelector('input[name="key"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(form.textContent).toContain(`Flag taken already exists in project ${projectKey}`);
  });

  it('shows a flag with a tab per environment, each with its targeting switch', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'Kill switch', tags: ['ops'] });
    await api.patch(`/projects/${projectKey}/flags/kill-switch/targeting/production`, { version: 1, on: true });

    const response = await admin.get(`/projects/${projectKey}/flags/kill-switch`);
    expect(response.status).toBe(200);
    const detail = await page(response);
    expect(detail.textContent).toContain('Kill switch');
    expect(detail.textContent).toContain('kill-switch');

    const tabs = detail.querySelectorAll('.tab-panel');
    expect(tabs.map((tab) => tab.querySelector('.tab-panel-heading')?.textContent.trim())).toEqual([
      'Development',
      'Production',
    ]);
    const switches = tabs.map((tab) => tab.querySelector('input[role="switch"][name="on"]'));
    expect(switches.map((input) => input?.hasAttribute('checked'))).toEqual([false, true]);
  });

  it('switches targeting on and off in one environment, as the SDK sees it', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'kill-switch', name: 'Kill switch' });
    const detail = `/projects/${projectKey}/flags/kill-switch`;
    const production = `/projects/${projectKey}/flags/kill-switch/targeting/production`;
    const sdkKey = (await api.get(`/projects/${projectKey}/environments/production`)).body.sdkKey;
    const servedSnapshot = async () =>
      (await api.get('/evaluator/snapshot', { 'x-ctff-sdk-key': sdkKey })).body.flags[0].targeting.on;

    const on = await admin.post(detail, { _action: 'targeting', environment: 'production', version: '1', on: 'on' });
    expect(on.status).toBe(303);
    expect(on.headers.get('location')).toBe(`${detail}?environment=production`);
    // The confirmation names the environment as the page does.
    const cookie = on.headers.get('set-cookie')?.split(';')[0] ?? '';
    const confirmed = await fetch(`${core.baseUrl}${detail}?environment=production`, { headers: { cookie } });
    expect(await confirmed.text()).toContain('Targeting switched on in Production');
    expect((await api.get(production)).body).toMatchObject({ on: true, version: 2 });
    expect(await servedSnapshot()).toBe(true);
    expect((await api.get(`/projects/${projectKey}/flags/kill-switch/targeting/development`)).body.on).toBe(false);

    // An unchecked switch submits no value.
    const off = await admin.post(detail, { _action: 'targeting', environment: 'production', version: '2' });
    expect(off.status).toBe(303);
    expect((await api.get(production)).body).toMatchObject({ on: false, version: 3 });
    expect(await servedSnapshot()).toBe(false);
  });

  it('answers a flag that does not exist with 404', async () => {
    const projectKey = await project();
    const response = await admin.get(`/projects/${projectKey}/flags/no-such-flag`);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('There is no flag no-such-flag');
  });

  it('edits the name, description and tags of a flag, showing its key as unchangeable', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'photo-id-beta', name: 'Photo ID', tags: ['beta'] });
    const edit = `/projects/${projectKey}/flags/photo-id-beta/edit`;

    const form = await page(await admin.get(edit));
    expect(form.querySelector('input[name="name"]')?.getAttribute('value')).toBe('Photo ID');
    expect(form.querySelector('input[name="tags"]')?.getAttribute('value')).toBe('beta');
    expect(form.querySelector('input[name="version"]')?.getAttribute('value')).toBe('1');
    // The key shows, read-only, and the form doesn't send it.
    const key = form.querySelector('input[readonly][value="photo-id-beta"]');
    expect(key).not.toBeNull();
    expect(key?.hasAttribute('name')).toBe(false);

    const saved = await admin.post(edit, {
      version: '1',
      name: 'Photo ID (beta)',
      description: 'Identify a bird from a photo',
      tags: 'beta, photos',
    });
    expect(saved.status).toBe(303);
    expect(saved.headers.get('location')).toBe(`/projects/${projectKey}/flags/photo-id-beta`);
    expect((await api.get(`/projects/${projectKey}/flags/photo-id-beta`)).body).toMatchObject({
      key: 'photo-id-beta',
      name: 'Photo ID (beta)',
      description: 'Identify a bird from a photo',
      tags: ['beta', 'photos'],
      version: 2,
    });

    const cleared = await admin.post(edit, { version: '2', name: 'Photo ID (beta)', description: '', tags: '' });
    expect(cleared.status).toBe(303);
    expect((await api.get(`/projects/${projectKey}/flags/photo-id-beta`)).body).toMatchObject({
      description: '',
      tags: [],
    });
  });

  it("shows the API's validation errors on the edit form", async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'named', name: 'Named' });
    const response = await admin.post(`/projects/${projectKey}/flags/named/edit`, { version: '1', name: ' ' });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('name must not be blank');
  });

  it('asks to reload, keeping what was typed, when the flag changed since the edit form was loaded', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'contended', name: 'Contended' });
    await api.patch(`/projects/${projectKey}/flags/contended`, { version: 1, name: 'Changed elsewhere' });

    const response = await admin.post(`/projects/${projectKey}/flags/contended/edit`, {
      version: '1',
      name: 'Mine',
      description: 'My description',
      tags: 'mine',
    });
    expect(response.status).toBe(409);
    const form = await page(response);
    expect(form.textContent).toContain('Changed elsewhere — reload');
    expect(form.querySelector(`a[href="/projects/${projectKey}/flags/contended/edit"]`)?.textContent).toContain(
      'Reload',
    );
    expect(form.querySelector('input[name="name"]')?.getAttribute('value')).toBe('Mine');
    expect(form.querySelector('textarea[name="description"]')?.textContent).toBe('My description');
    expect(form.querySelector('input[name="tags"]')?.getAttribute('value')).toBe('mine');
    // Saving again is still based on the version loaded, so it can't overwrite the other change.
    expect(form.querySelector('input[name="version"]')?.getAttribute('value')).toBe('1');
    expect((await api.get(`/projects/${projectKey}/flags/contended`)).body).toMatchObject({
      name: 'Changed elsewhere',
      version: 2,
    });
  });

  it('asks to reload when the targeting changed since the flag was loaded', async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'contended', name: 'Contended' });
    const production = `/projects/${projectKey}/flags/contended/targeting/production`;
    await api.patch(production, { version: 1, on: true });
    await api.patch(production, { version: 2, on: false });

    const response = await admin.post(`/projects/${projectKey}/flags/contended`, {
      _action: 'targeting',
      environment: 'production',
      version: '1',
      on: 'on',
    });
    expect(response.status).toBe(409);
    const detail = await page(response);
    const [development, productionTab] = detail.querySelectorAll('.tab-panel');
    expect(productionTab?.textContent).toContain('Changed elsewhere — reload');
    expect(development?.textContent).not.toContain('Changed elsewhere');
    // The switch shows what was submitted, still based on the version loaded.
    expect(productionTab?.querySelector('input[name="on"]')?.hasAttribute('checked')).toBe(true);
    expect(productionTab?.querySelector('label')?.textContent).toContain('(not saved)');
    expect(productionTab?.querySelector('input[name="version"]')?.getAttribute('value')).toBe('1');
    expect(detail.querySelector('flag-tabs')?.getAttribute('data-selected')).toBe('production');
    expect((await api.get(production)).body).toMatchObject({ on: false, version: 3 });
  });

  it("doesn't change targeting from a stale switch when its environment no longer exists", async () => {
    const projectKey = await project();
    await api.post(`/projects/${projectKey}/flags`, { key: 'orphan', name: 'Orphan' });
    await api.delete(`/projects/${projectKey}/environments/production`);
    const response = await admin.post(`/projects/${projectKey}/flags/orphan`, {
      _action: 'targeting',
      environment: 'production',
      version: '1',
      on: 'on',
    });
    expect(response.status).toBe(404);
    // There is no tab to show it in, so the page says so above the tabs.
    const detail = await page(response);
    expect(detail.querySelector('.targeting [role="alert"]')?.textContent).toContain('Environment production');
    expect(detail.querySelectorAll('.tab-panel')).toHaveLength(1);
  });
});
