import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startCore, type RunningCore } from './support/core.js';

describe('OpenAPI document', () => {
  let core: RunningCore;
  beforeAll(async () => {
    core = await startCore();
  });
  afterAll(() => core?.stop());

  it('is served for the versioned API, generated from the controllers', async () => {
    const response = await fetch(`${core.baseUrl}/api/v1/openapi.json`);
    expect(response.status).toBe(200);
    const document = (await response.json()) as { openapi: string; paths: Record<string, Record<string, unknown>> };

    expect(document.openapi).toMatch(/^3\./);
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/projects',
        '/api/v1/projects/{projectKey}',
        '/api/v1/projects/{projectKey}/environments',
        '/api/v1/projects/{projectKey}/environments/{environmentKey}',
        '/api/v1/projects/{projectKey}/flags',
        '/api/v1/projects/{projectKey}/flags/{flagKey}',
        '/api/v1/projects/{projectKey}/flags/{flagKey}/targeting',
        '/api/v1/projects/{projectKey}/flags/{flagKey}/targeting/{environmentKey}',
        '/api/v1/evaluator/snapshot',
      ]),
    );
    expect(Object.keys(document.paths['/api/v1/projects/{projectKey}/flags/{flagKey}'] ?? {})).toEqual(
      expect.arrayContaining(['get', 'patch', 'delete']),
    );
  });

  it('matches the copy the core-api-client is generated from', async () => {
    const served = await (await fetch(`${core.baseUrl}/api/v1/openapi.json`)).json();
    const committed = JSON.parse(
      await readFile(new URL('../../../libs/core-api-client/openapi.json', import.meta.url), 'utf8'),
    ) as unknown;
    // When this fails, the API changed: refresh the copy with `pnpm nx run @ctff/core:openapi`.
    expect(committed).toEqual(served);
  });

  it('has a browsable UI', async () => {
    const response = await fetch(`${core.baseUrl}/api/docs`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/html/);
  });
});
