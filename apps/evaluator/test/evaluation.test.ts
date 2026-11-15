import { createClient, type EvaluationDetail } from '@ctff/sdk';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { environment, flag, pollIntervalMs, startEvaluator, type RunningEvaluator } from './support/evaluator.js';
import { startFakeCore, type FakeCore } from './support/fake-core.js';

describe('evaluating through the SDK', () => {
  let core: FakeCore;
  let evaluator: RunningEvaluator;
  beforeAll(async () => {
    core = await startFakeCore();
    core.put('ctff-env-production', environment('production', [flag('rare-bird-alerts')]));
    core.put(
      'ctff-env-development',
      environment('development', [
        flag('new-sighting-form', { on: true }),
        flag('photo-id-beta', { on: true, defaultVariation: 1 }),
        flag('rare-bird-alerts', { offVariation: 0 }),
      ]),
    );
    evaluator = await startEvaluator(core.url);
    await evaluator.waitUntilReady();
  });
  afterAll(async () => {
    await evaluator?.stop();
    await core?.stop();
  });

  const client = () => createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
  const alice = { user_id: 'alice', country: 'CA' };

  it('serves the off variation while targeting is off, and the default variation once it is switched on', async () => {
    expect(await client().variation('rare-bird-alerts', alice, true)).toBe(false);

    core.put('ctff-env-production', environment('production', [flag('rare-bird-alerts', { on: true, version: 2 })]));

    await expect
      .poll(() => client().variation('rare-bird-alerts', alice, false), { timeout: pollIntervalMs * 20 })
      .toBe(true);
  });

  it.each<[string, string, EvaluationDetail]>([
    ['targeting off', 'rare-bird-alerts', { value: true, variationIndex: 0, reason: { kind: 'OFF' } }],
    ['targeting on', 'new-sighting-form', { value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } }],
    [
      'targeting on with false as the default variation',
      'photo-id-beta',
      { value: false, variationIndex: 1, reason: { kind: 'DEFAULT' } },
    ],
  ])('reports the variation index and evaluation reason for %s', async (_case, flagKey, expected) => {
    const development = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-development' });
    expect(await development.variationDetail(flagKey, alice, !expected.value)).toEqual(expected);
  });

  it('evaluates in the environment the SDK key names', async () => {
    const development = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-development' });
    const production = createClient({ evaluatorUrl: `${evaluator.url}/`, sdkKey: 'ctff-env-production' });
    core.put('ctff-env-production', environment('production', [flag('rare-bird-alerts')]));
    await expect.poll(() => production.variation('rare-bird-alerts', alice, true)).toBe(false);
    expect(await development.variation('rare-bird-alerts', alice, false)).toBe(true);
  });

  it('evaluates contexts with missing attributes', async () => {
    const development = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-development' });
    expect(await development.variationDetail('new-sighting-form', {}, false)).toEqual({
      value: true,
      variationIndex: 0,
      reason: { kind: 'DEFAULT' },
    });
  });
});

describe('the fallback value', () => {
  let core: FakeCore;
  let evaluator: RunningEvaluator;
  beforeAll(async () => {
    core = await startFakeCore();
    core.put('ctff-env-production', environment('production', [flag('rare-bird-alerts', { on: true })]));
    evaluator = await startEvaluator(core.url);
    await evaluator.waitUntilReady();
  });
  afterAll(async () => {
    await evaluator?.stop();
    await core?.stop();
  });

  const alice = { user_id: 'alice', country: 'CA' };

  it.each([false, true])(
    'is returned, as %s, with FLAG_NOT_FOUND for a flag the environment does not have',
    async (fallbackValue) => {
      const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
      expect(await client.variationDetail('photo-id-beta', alice, fallbackValue)).toEqual({
        value: fallbackValue,
        variationIndex: null,
        reason: { kind: 'FLAG_NOT_FOUND' },
      });
      expect(await client.variation('photo-id-beta', alice, fallbackValue)).toBe(fallbackValue);
    },
  );

  it('is returned with an UNKNOWN_SDK_KEY error for an SDK key the Evaluator does not know', async () => {
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-unknown' });
    expect(await client.variationDetail('rare-bird-alerts', alice, false)).toEqual({
      value: false,
      variationIndex: null,
      reason: { kind: 'ERROR', errorKind: 'UNKNOWN_SDK_KEY' },
    });
  });

  it('is returned with a MALFORMED_CONTEXT error for a context with the wrong types', async () => {
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    const context = { user_id: 42 } as unknown as { user_id: string };
    expect(await client.variationDetail('rare-bird-alerts', context, false)).toEqual({
      value: false,
      variationIndex: null,
      reason: { kind: 'ERROR', errorKind: 'MALFORMED_CONTEXT' },
    });
  });

  it('is returned with a NETWORK_ERROR when the Evaluator is down', async () => {
    const down = createServer();
    await new Promise<void>((resolve) => down.listen(0, '127.0.0.1', resolve));
    const { port } = down.address() as AddressInfo;
    await new Promise((resolve) => down.close(resolve));

    const client = createClient({ evaluatorUrl: `http://127.0.0.1:${port}`, sdkKey: 'ctff-env-production' });
    expect(await client.variationDetail('rare-bird-alerts', alice, false)).toEqual({
      value: false,
      variationIndex: null,
      reason: { kind: 'ERROR', errorKind: 'NETWORK_ERROR' },
    });
  });

  it('is returned with a TIMEOUT error, after about the timeout, when the Evaluator is too slow', async () => {
    // A stand-in for an overloaded Evaluator: it accepts requests and never answers them.
    const slow = createServer(() => undefined);
    await new Promise<void>((resolve) => slow.listen(0, '127.0.0.1', resolve));
    const { port } = slow.address() as AddressInfo;
    try {
      const client = createClient({ evaluatorUrl: `http://127.0.0.1:${port}`, sdkKey: 'ctff-env-production' });
      const started = performance.now();
      expect(await client.variationDetail('rare-bird-alerts', alice, true)).toEqual({
        value: true,
        variationIndex: null,
        reason: { kind: 'ERROR', errorKind: 'TIMEOUT' },
      });
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(450);
      expect(elapsed).toBeLessThan(1500);

      const quick = createClient({
        evaluatorUrl: `http://127.0.0.1:${port}`,
        sdkKey: 'ctff-env-production',
        timeoutMs: 50,
      });
      expect(await quick.variation('rare-bird-alerts', alice, false)).toBe(false);
    } finally {
      slow.closeAllConnections();
      await new Promise((resolve) => slow.close(resolve));
    }
  });

  it('is returned with a TIMEOUT error when the Evaluator starts answering but is too slow to finish', async () => {
    const stalling = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write('{"flagKey":');
    });
    await new Promise<void>((resolve) => stalling.listen(0, '127.0.0.1', resolve));
    const { port } = stalling.address() as AddressInfo;
    try {
      const client = createClient({
        evaluatorUrl: `http://127.0.0.1:${port}`,
        sdkKey: 'ctff-env-production',
        timeoutMs: 100,
      });
      expect(await client.variationDetail('rare-bird-alerts', alice, true)).toEqual({
        value: true,
        variationIndex: null,
        reason: { kind: 'ERROR', errorKind: 'TIMEOUT' },
      });
    } finally {
      stalling.closeAllConnections();
      await new Promise((resolve) => stalling.close(resolve));
    }
  });

  it('is returned with an EVALUATOR_ERROR when the answer is not an evaluation', async () => {
    const other = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"hello":"world"}');
    });
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
    const { port } = other.address() as AddressInfo;
    try {
      const client = createClient({ evaluatorUrl: `http://127.0.0.1:${port}`, sdkKey: 'ctff-env-production' });
      expect(await client.variationDetail('rare-bird-alerts', alice, false)).toEqual({
        value: false,
        variationIndex: null,
        reason: { kind: 'ERROR', errorKind: 'EVALUATOR_ERROR' },
      });
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });
});
