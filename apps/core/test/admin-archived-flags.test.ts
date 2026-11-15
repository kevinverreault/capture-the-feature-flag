import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, uniqueKey, type ApiClient } from './support/api.js';
import { browser, page, type Browser } from './support/browser.js';
import { startCore, type RunningCore } from './support/core.js';

describe('admin app: archived flags', () => {
  let core: RunningCore;
  let admin: Browser;
  let api: ApiClient;
  beforeAll(async () => {
    core = await startCore();
    admin = browser(core.baseUrl);
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  /** A project with a production environment and the given flags. */
  async function project(...flagKeys: string[]): Promise<string> {
    const key = uniqueKey('archived');
    await api.post('/projects', { key, name: 'Archived' });
    await api.post(`/projects/${key}/environments`, { key: 'production', name: 'Production' });
    for (const flagKey of flagKeys) await api.post(`/projects/${key}/flags`, { key: flagKey, name: flagKey });
    return key;
  }

  /** The flag list's rows: each flag key, and whether it is marked archived. */
  async function listed(path: string): Promise<{ key: string; archived: boolean }[]> {
    return (await page(await admin.get(path))).querySelectorAll('tr[data-flag]').map((row) => ({
      key: row.getAttribute('data-flag') ?? '',
      archived: row.hasAttribute('data-archived'),
    }));
  }

  /** Follows a redirect with the flash cookie it set, as a browser does, and returns the page's text. */
  async function followed(response: Response): Promise<string> {
    const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    const next = await fetch(`${core.baseUrl}${response.headers.get('location')}`, { headers: { cookie } });
    return next.text();
  }

  it('hides archived flags from the flag list unless "show archived" is on', async () => {
    const projectKey = await project('new-sighting-form', 'old-feed');
    await api.post(`/projects/${projectKey}/flags/old-feed/archive`, {});
    const flags = `/projects/${projectKey}/flags`;

    expect(await listed(flags)).toEqual([{ key: 'new-sighting-form', archived: false }]);
    expect(await listed(`${flags}?archived=on`)).toEqual([
      { key: 'new-sighting-form', archived: false },
      { key: 'old-feed', archived: true },
    ]);
    expect(await listed(`${flags}?archived=on&search=old`)).toEqual([{ key: 'old-feed', archived: true }]);

    const shown = await page(await admin.get(`${flags}?archived=on`));
    expect(shown.querySelector('input[name="archived"]')?.hasAttribute('checked')).toBe(true);
    const hidden = await page(await admin.get(flags));
    expect(hidden.querySelector('input[name="archived"]')?.hasAttribute('checked')).toBe(false);
  });

  it('says so when every flag of the project is archived, offering to show them', async () => {
    const projectKey = await project('old-feed');
    await api.post(`/projects/${projectKey}/flags/old-feed/archive`, {});
    const list = await page(await admin.get(`/projects/${projectKey}/flags`));
    expect(list.textContent).not.toContain('This project has no flags yet');
    expect(list.textContent).toContain('Every flag of this project is archived');
    expect(list.querySelector('input[name="archived"]')).not.toBeNull();
  });

  it('archives a flag from its detail page, which then offers restore and delete instead', async () => {
    const projectKey = await project('kill-switch');
    const detail = `/projects/${projectKey}/flags/kill-switch`;
    const live = await page(await admin.get(detail));
    expect(live.querySelector('form input[name="_action"][value="archive"]')).not.toBeNull();
    expect(live.querySelector('form input[name="_action"][value="delete"]')).toBeNull();

    const archived = await admin.post(detail, { _action: 'archive' });
    expect(archived.status).toBe(303);
    expect(archived.headers.get('location')).toBe(detail);
    expect(await followed(archived)).toContain('Flag kill-switch archived');
    expect((await api.get(`/projects/${projectKey}/flags/kill-switch`)).body.archived).toBe(true);

    const shown = await page(await admin.get(detail));
    expect(shown.textContent).toContain('This flag is archived');
    expect(shown.querySelector('form input[name="_action"][value="restore"]')).not.toBeNull();
    expect(shown.querySelector('confirm-delete form input[name="_action"][value="delete"]')).not.toBeNull();
    expect(shown.querySelector('form input[name="_action"][value="archive"]')).toBeNull();
    // Its targeting is kept but not served, so it isn't switched from here.
    expect(shown.querySelector('form input[name="_action"][value="targeting"]')).toBeNull();
  });

  it('restores an archived flag with the targeting it had', async () => {
    const projectKey = await project('kill-switch');
    const flag = `/projects/${projectKey}/flags/kill-switch`;
    await api.patch(`${flag}/targeting/production`, { version: 1, on: true });
    await api.post(`${flag}/archive`, {});

    const restored = await admin.post(flag, { _action: 'restore' });
    expect(restored.status).toBe(303);
    expect(restored.headers.get('location')).toBe(flag);
    expect(await followed(restored)).toContain('Flag kill-switch restored');
    expect((await api.get(flag)).body.archived).toBe(false);
    expect((await api.get(`${flag}/targeting/production`)).body.on).toBe(true);
    expect(await listed(`/projects/${projectKey}/flags`)).toEqual([{ key: 'kill-switch', archived: false }]);
  });

  it('permanently deletes an archived flag, back on the flag list', async () => {
    const projectKey = await project('kill-switch');
    const flag = `/projects/${projectKey}/flags/kill-switch`;
    await api.post(`${flag}/archive`, {});

    const deleted = await admin.post(flag, { _action: 'delete' });
    expect(deleted.status).toBe(303);
    expect(deleted.headers.get('location')).toBe(`/projects/${projectKey}/flags`);
    expect(await followed(deleted)).toContain('Flag kill-switch deleted');
    expect((await api.get(flag)).status).toBe(404);
  });

  it("shows Core's refusal to delete a flag restored since the page was loaded", async () => {
    const projectKey = await project('kill-switch');
    const flag = `/projects/${projectKey}/flags/kill-switch`;

    const refused = await admin.post(flag, { _action: 'delete' });
    expect(refused.status).toBe(409);
    expect(await refused.text()).toContain('archive it before deleting it');
    expect((await api.get(flag)).status).toBe(200);
  });

  it('sends the edit page of an archived flag back to the flag, which must be restored first', async () => {
    const projectKey = await project('kill-switch');
    const flag = `/projects/${projectKey}/flags/kill-switch`;
    await api.post(`${flag}/archive`, {});

    for (const response of [
      await admin.get(`${flag}/edit`),
      await admin.post(`${flag}/edit`, { version: '2', name: 'Edited' }),
    ]) {
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(flag);
      expect(await followed(response)).toContain('restore it before editing it');
    }
    expect((await api.get(flag)).body.name).toBe('kill-switch');
  });
});
