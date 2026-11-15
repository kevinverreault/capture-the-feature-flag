import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CoreApiError, createCoreApiClient, unwrap } from '../src/index.js';

/** A stand-in for Core that answers each path with a canned status and JSON body. */
const responses: Record<string, { status: number; body?: unknown }> = {
  'GET /api/v1/projects': { status: 200, body: [{ key: 'birdwatch', name: 'Birdwatch' }] },
  'POST /api/v1/projects': {
    status: 400,
    body: {
      statusCode: 400,
      message: ['project key must be lowercase kebab-case'],
      error: 'Bad Request',
      fields: { key: ['project key must be lowercase kebab-case'] },
    },
  },
  'GET /api/v1/projects/gone': { status: 404, body: { statusCode: 404, message: 'Project gone not found' } },
  'DELETE /api/v1/projects/birdwatch': { status: 204 },
  'GET /api/v1/projects/broken': { status: 502 },
};

describe('core-api-client', () => {
  let server: Server;
  let baseUrl: string;
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/api/v1/projects/actor') {
        // Answers with the actor the request was sent as, in a project's name.
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ key: 'actor', name: req.headers['x-ctff-actor'] ?? null }));
        return;
      }
      const canned = responses[`${req.method} ${req.url}`] ?? { status: 500 };
      res.writeHead(canned.status, canned.body === undefined ? {} : { 'content-type': 'application/json' });
      res.end(canned.body === undefined ? undefined : JSON.stringify(canned.body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('returns the body of a successful response', async () => {
    const core = createCoreApiClient({ baseUrl });
    await expect(unwrap(core.GET('/api/v1/projects'))).resolves.toEqual([{ key: 'birdwatch', name: 'Birdwatch' }]);
  });

  it('resolves a 204 to undefined', async () => {
    const core = createCoreApiClient({ baseUrl });
    const request = core.DELETE('/api/v1/projects/{projectKey}', { params: { path: { projectKey: 'birdwatch' } } });
    await expect(unwrap(request)).resolves.toBeUndefined();
  });

  it('throws the status and the list of validation messages of a 400', async () => {
    const core = createCoreApiClient({ baseUrl });
    const error = await unwrap(core.POST('/api/v1/projects', { body: { key: 'Bad Key', name: 'x' } })).catch((e) => e);
    expect(error).toBeInstanceOf(CoreApiError);
    expect(error).toMatchObject({
      status: 400,
      messages: ['project key must be lowercase kebab-case'],
      fields: { key: ['project key must be lowercase kebab-case'] },
    });
  });

  it('turns a single error message into a list of one', async () => {
    const core = createCoreApiClient({ baseUrl });
    const request = core.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey: 'gone' } } });
    await expect(unwrap(request)).rejects.toMatchObject({
      status: 404,
      messages: ['Project gone not found'],
      fields: {},
    });
  });

  it('describes an error response without a body by its status', async () => {
    const core = createCoreApiClient({ baseUrl });
    const request = core.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey: 'broken' } } });
    await expect(unwrap(request)).rejects.toMatchObject({ status: 502, messages: ['Core answered 502'] });
  });

  it('accepts a base URL with a trailing slash', async () => {
    const core = createCoreApiClient({ baseUrl: `${baseUrl}/` });
    await expect(unwrap(core.GET('/api/v1/projects'))).resolves.toHaveLength(1);
  });

  it('sends the actor it is given, percent-encoded so that any display name fits in a header', async () => {
    const params = { params: { path: { projectKey: 'actor' } } };
    const named = createCoreApiClient({ baseUrl, actor: 'Zoë Ørn' });
    await expect(unwrap(named.GET('/api/v1/projects/{projectKey}', params))).resolves.toMatchObject({
      name: 'Zo%C3%AB%20%C3%98rn',
    });
    const unnamed = createCoreApiClient({ baseUrl, actor: '' });
    await expect(unwrap(unnamed.GET('/api/v1/projects/{projectKey}', params))).resolves.toMatchObject({ name: null });
  });
});
