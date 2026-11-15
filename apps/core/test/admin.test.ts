import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiClient, uniqueKey } from './support/api.js';
import { browser, type Browser } from './support/browser.js';
import { startCore, type RunningCore } from './support/core.js';

describe('admin app inside Core', () => {
  let core: RunningCore;
  let admin: Browser;
  let api: ReturnType<typeof apiClient>;
  beforeAll(async () => {
    core = await startCore();
    admin = browser(core.baseUrl);
    api = apiClient(core.baseUrl);
  });
  afterAll(() => core?.stop());

  it('opens on the list of projects', async () => {
    const home = await admin.get('/');
    expect(home.status).toBe(302);
    expect(home.headers.get('location')).toBe('/projects');

    const projects = await admin.get('/projects');
    expect(projects.status).toBe(200);
    expect(projects.headers.get('content-type')).toMatch(/text\/html/);
    expect(await projects.text()).toContain('Create a project');
  });

  it('serves its stylesheets and scripts', async () => {
    const html = await (await admin.get('/projects')).text();
    const asset = html.match(/(?:href|src)="(\/_astro\/[^"]+)"/)?.[1] ?? '/_astro/none-in-the-page';
    const response = await admin.get(asset);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('immutable');
  });

  it('leaves the API and health routes to Core', async () => {
    const projects = await admin.get('/api/v1/projects');
    expect(projects.status).toBe(200);
    expect(projects.headers.get('content-type')).toMatch(/application\/json/);

    const unknown = await admin.get('/api/v1/no-such-route');
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('content-type')).toMatch(/application\/json/);

    // Express matches routes case-insensitively, so the admin app must not take these either.
    const upperCase = await admin.get('/API/v1/projects');
    expect(upperCase.headers.get('content-type')).toMatch(/application\/json/);

    expect((await admin.get('/health/live')).status).toBe(200);
    expect((await admin.get('/api/docs')).status).toBe(200);
  });

  it('answers an unknown page with its own 404 page', async () => {
    const response = await admin.get('/no-such-page');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toMatch(/text\/html/);
    expect(await response.text()).toContain('Not found');
  });

  it('creates a project from a form post, then shows it in the project switcher', async () => {
    const key = uniqueKey('admin-project');
    const created = await admin.post('/projects', { key, name: 'Admin project' });
    expect(created.status).toBe(303);
    expect(created.headers.get('location')).toBe(`/projects/${key}`);
    expect((await api.get(`/projects/${key}`)).body).toMatchObject({ key, name: 'Admin project' });

    const page = await (await admin.get(`/projects/${key}/environments`)).text();
    expect(page).toContain('Project: Admin project');
    expect(page).toContain(`href="/projects/${key}"`);
  });

  it('shows the validation errors from the API on the form', async () => {
    const response = await admin.post('/projects', { key: 'Not A Key', name: '' });
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('project key must be lowercase kebab-case');
    expect(html).toContain('name must not be blank');
    // What was typed is kept, so it can be corrected.
    expect(html).toContain('value="Not A Key"');
  });

  it('shows a key already in use as an error on the key', async () => {
    const key = uniqueKey('taken');
    await api.post('/projects', { key, name: 'Taken' });
    const response = await admin.post('/projects', { key, name: 'Again' });
    expect(response.status).toBe(409);
    expect(await response.text()).toContain(`Project ${key} already exists`);
  });

  it('refuses a form post from another site', async () => {
    const response = await fetch(`${core.baseUrl}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' },
      body: new URLSearchParams({ key: uniqueKey('cross-site'), name: 'Cross site' }).toString(),
    });
    expect(response.status).toBe(403);
  });

  it('refuses a form post that says nothing about where it comes from', async () => {
    const response = await fetch(`${core.baseUrl}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: uniqueKey('no-origin'), name: 'No origin' }).toString(),
    });
    expect(response.status).toBe(403);
  });

  it('logs its requests as JSON, with Core', async () => {
    await admin.get('/projects?logged=yes');
    // The line is written once the response has finished.
    await vi.waitFor(() =>
      expect(core.logs).toContainEqual(
        expect.objectContaining({
          msg: 'request completed',
          req: expect.objectContaining({ url: '/projects?logged=yes' }),
        }),
      ),
    );
  });

  it('renames and deletes a project', async () => {
    const key = uniqueKey('renamed');
    await api.post('/projects', { key, name: 'Before' });

    const renamed = await admin.post(`/projects/${key}/settings`, { _action: 'rename', name: 'After' });
    expect(renamed.status).toBe(303);
    expect((await api.get(`/projects/${key}`)).body.name).toBe('After');

    const deleted = await admin.post(`/projects/${key}/settings`, { _action: 'delete' });
    expect(deleted.status).toBe(303);
    expect(deleted.headers.get('location')).toBe('/projects');
    expect((await api.get(`/projects/${key}`)).status).toBe(404);
  });

  it('manages the environments of a project and shows their SDK keys', async () => {
    const project = uniqueKey('environments');
    await api.post('/projects', { key: project, name: 'Environments' });

    const created = await admin.post(`/projects/${project}/environments`, { key: 'staging', name: 'Staging' });
    expect(created.status).toBe(303);
    const environment = (await api.get(`/projects/${project}/environments/staging`)).body;
    const list = await (await admin.get(`/projects/${project}/environments`)).text();
    expect(list).toContain('Staging');
    expect(list).toContain(environment.sdkKey);

    const invalid = await admin.post(`/projects/${project}/environments/staging`, { _action: 'rename', name: ' ' });
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).toContain('name must not be blank');

    const renamed = await admin.post(`/projects/${project}/environments/staging`, { _action: 'rename', name: 'QA' });
    expect(renamed.status).toBe(303);
    expect((await api.get(`/projects/${project}/environments/staging`)).body.name).toBe('QA');

    const deleted = await admin.post(`/projects/${project}/environments/staging`, { _action: 'delete' });
    expect(deleted.status).toBe(303);
    expect((await api.get(`/projects/${project}/environments/staging`)).status).toBe(404);
  });

  it('answers a project that does not exist with 404', async () => {
    const response = await admin.get('/projects/no-such-project/environments');
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('There is no project no-such-project');
  });
});

describe('Core without the admin app', () => {
  let core: RunningCore;
  beforeAll(async () => {
    core = await startCore({ env: { ADMIN_ENABLED: 'false' } });
  });
  afterAll(() => core?.stop());

  it('serves only its API when ADMIN_ENABLED is false', async () => {
    const page = await fetch(`${core.baseUrl}/projects`);
    expect(page.status).toBe(404);
    expect(page.headers.get('content-type')).toMatch(/application\/json/);
    expect((await fetch(`${core.baseUrl}/api/v1/projects`)).status).toBe(200);
  });
});

describe('admin app when Core cannot be reached', () => {
  let core: RunningCore;
  beforeAll(async () => {
    // Nothing listens on port 1.
    core = await startCore({ env: { ADMIN_CORE_URL: 'http://127.0.0.1:1' } });
  });
  afterAll(() => core?.stop());

  it('answers with its error page and logs the failure as JSON', async () => {
    const response = await fetch(`${core.baseUrl}/projects`);
    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toMatch(/text\/html/);
    expect(await response.text()).toContain('Something went wrong');
    expect(core.logs).toContainEqual(
      expect.objectContaining({ level: 50, msg: 'Admin page failed', url: '/projects' }),
    );
    expect(core.logs.filter((entry) => 'unparsed' in entry)).toEqual([]);
  });
});

describe('admin app pointed at a separate Core', () => {
  let backend: RunningCore;
  let frontend: RunningCore;
  beforeAll(async () => {
    backend = await startCore();
    frontend = await startCore({ env: { ADMIN_CORE_URL: backend.baseUrl } });
  });
  afterAll(async () => {
    await frontend?.stop();
    await backend?.stop();
  });

  it('shows the data of the Core named by ADMIN_CORE_URL', async () => {
    const key = uniqueKey('elsewhere');
    await apiClient(backend.baseUrl).post('/projects', { key, name: 'Elsewhere' });
    const html = await (await fetch(`${frontend.baseUrl}/projects`)).text();
    expect(html).toContain('Elsewhere');
    expect((await apiClient(frontend.baseUrl).get(`/projects/${key}`)).status).toBe(404);
  });
});
