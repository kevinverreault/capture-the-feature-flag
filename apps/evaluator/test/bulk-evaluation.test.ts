import { createClient } from '@ctff/sdk';
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { environment, flag, startEvaluator, type RunningEvaluator } from './support/evaluator.js';
import { startFakeCore, type FakeCore } from './support/fake-core.js';

describe('evaluating every flag at once through the SDK', () => {
  let core: FakeCore;
  let evaluator: RunningEvaluator;
  beforeAll(async () => {
    core = await startFakeCore();
    core.put(
      'ctff-env-development',
      environment('development', [
        flag('new-sighting-form', { on: true }),
        flag('photo-id-beta', { on: true, defaultVariation: 1 }),
        flag('rare-bird-alerts'),
      ]),
    );
    core.put('ctff-env-empty', environment('empty', []));
    evaluator = await startEvaluator(core.url);
    await evaluator.waitUntilReady();
  });
  afterAll(async () => {
    await evaluator?.stop();
    await core?.stop();
  });

  const alice = { user_id: 'alice', country: 'CA' };

  it('returns the value and evaluation reason of every flag in the environment', async () => {
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-development' });
    expect(await client.allFlags(alice)).toEqual({
      values: { 'new-sighting-form': true, 'photo-id-beta': false, 'rare-bird-alerts': false },
      details: {
        'new-sighting-form': { value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } },
        'photo-id-beta': { value: false, variationIndex: 1, reason: { kind: 'DEFAULT' } },
        'rare-bird-alerts': { value: false, variationIndex: 1, reason: { kind: 'OFF' } },
      },
      error: null,
    });
  });

  it('has no entry for a flag the environment does not have, even one named like an object property', async () => {
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-development' });
    const flags = await client.allFlags(alice);
    expect(flags.values['constructor'] ?? false).toBe(false);
    expect(flags.details['constructor']).toBeUndefined();
    expect('toString' in flags.values).toBe(false);
  });

  it('returns no flags for an environment without flags', async () => {
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-empty' });
    expect(await client.allFlags(alice)).toEqual({ values: {}, details: {}, error: null });
  });

  it('gives every flag a MALFORMED_CONTEXT error, and no values, for a context with the wrong types', async () => {
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-development' });
    const malformed = { value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_CONTEXT' } };
    expect(await client.allFlags({ country: 'Canada' })).toEqual({
      values: {},
      details: { 'new-sighting-form': malformed, 'photo-id-beta': malformed, 'rare-bird-alerts': malformed },
      error: null,
    });
  });

  it('returns no flags, with an UNKNOWN_SDK_KEY error, for an SDK key the Evaluator does not know', async () => {
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-unknown' });
    expect(await client.allFlags(alice)).toEqual({ values: {}, details: {}, error: 'UNKNOWN_SDK_KEY' });
  });

  it('returns no flags, with a NETWORK_ERROR, when the Evaluator is down', async () => {
    const down = createServer();
    await new Promise<void>((resolve) => down.listen(0, '127.0.0.1', resolve));
    const { port } = down.address() as AddressInfo;
    await new Promise((resolve) => down.close(resolve));

    const client = createClient({ evaluatorUrl: `http://127.0.0.1:${port}`, sdkKey: 'ctff-env-development' });
    expect(await client.allFlags(alice)).toEqual({ values: {}, details: {}, error: 'NETWORK_ERROR' });
  });

  it('returns no flags, with a TIMEOUT error, when the Evaluator is too slow', async () => {
    await withEvaluatorStandIn(
      () => undefined,
      async (url) => {
        const client = createClient({ evaluatorUrl: url, sdkKey: 'ctff-env-development', timeoutMs: 100 });
        expect(await client.allFlags(alice)).toEqual({ values: {}, details: {}, error: 'TIMEOUT' });
      },
    );
  });

  it.each([
    ['not a bulk evaluation', { hello: 'world' }],
    ['a flag without its key', { flags: [{ value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } }] }],
    [
      'an inconsistent flag',
      { flags: [{ flagKey: 'rare-bird-alerts', value: true, variationIndex: 0, reason: { kind: 'ERROR' } }] },
    ],
    [
      'a flag listed twice',
      {
        flags: [
          { flagKey: 'rare-bird-alerts', value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } },
          { flagKey: 'rare-bird-alerts', value: false, variationIndex: 1, reason: { kind: 'OFF' } },
        ],
      },
    ],
    [
      'a flag that was not found',
      {
        flags: [{ flagKey: 'rare-bird-alerts', value: null, variationIndex: null, reason: { kind: 'FLAG_NOT_FOUND' } }],
      },
    ],
  ])('returns no flags, with an EVALUATOR_ERROR, for an answer that is %s', async (_case, answer) => {
    await withEvaluatorStandIn(
      (_request, response) =>
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer)),
      async (url) => {
        const client = createClient({ evaluatorUrl: url, sdkKey: 'ctff-env-development' });
        expect(await client.allFlags(alice)).toEqual({ values: {}, details: {}, error: 'EVALUATOR_ERROR' });
      },
    );
  });
});

/** Runs `use` against a stand-in for the Evaluator that answers with `listener`. */
async function withEvaluatorStandIn(listener: RequestListener, use: (url: string) => Promise<void>): Promise<void> {
  const server = createServer(listener);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await use(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
