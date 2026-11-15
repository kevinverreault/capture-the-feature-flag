import { createClient } from '@ctff/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { environment, flag, pollIntervalMs, startEvaluator, type RunningEvaluator } from './support/evaluator.js';
import { startFakeCore, type FakeCore } from './support/fake-core.js';

describe('polling Core', () => {
  let core: FakeCore | undefined;
  let evaluator: RunningEvaluator | undefined;
  afterEach(async () => {
    await evaluator?.stop();
    await core?.stop();
    evaluator = undefined;
    core = undefined;
  });

  const alice = { user_id: 'alice', country: 'CA' };
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function start(): Promise<{ core: FakeCore; evaluator: RunningEvaluator }> {
    core = await startFakeCore();
    core.put('ctff-env-production', environment('production', [flag('rare-bird-alerts')]));
    evaluator = await startEvaluator(core.url);
    await evaluator.waitUntilReady();
    return { core, evaluator };
  }

  it('is not ready, and answers evaluations with NOT_READY, until its first snapshot has loaded', async () => {
    core = await startFakeCore();
    core.put('ctff-env-production', environment('production', [flag('rare-bird-alerts', { on: true })]));
    core.setAvailable(false);
    evaluator = await startEvaluator(core.url);
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });

    await expect.poll(() => core?.requests.length).toBeGreaterThanOrEqual(2);
    expect(await evaluator.isReady()).toBe(false);
    expect((await fetch(`${evaluator.url}/health/live`)).ok).toBe(true);
    expect(await client.variationDetail('rare-bird-alerts', alice, false)).toEqual({
      value: false,
      variationIndex: null,
      reason: { kind: 'ERROR', errorKind: 'NOT_READY' },
    });

    core.setAvailable(true);
    await evaluator.waitUntilReady();
    expect(await client.variation('rare-bird-alerts', alice, false)).toBe(true);
  });

  it('is not ready while the environment list loads but a snapshot on it does not', async () => {
    core = await startFakeCore();
    core.put('ctff-env-production', environment('production', [flag('rare-bird-alerts')]));
    // A snapshot Core can't serve: the list names it, but its snapshot fails to parse as one.
    core.put('ctff-env-broken', { projectKey: 'birdwatch', environmentKey: 'broken' } as never);
    evaluator = await startEvaluator(core.url);

    await expect
      .poll(() => core?.requests.filter((request) => request.sdkKey === 'ctff-env-broken').length)
      .toBeGreaterThanOrEqual(2);
    expect(await evaluator.isReady()).toBe(false);

    core.put('ctff-env-broken', environment('broken', []));
    await evaluator.waitUntilReady();
  });

  it('polls every interval with the ETags it holds, so unchanged snapshots get 304', async () => {
    const { core } = await start();
    const before = core.requests.length;
    await sleep(pollIntervalMs * 5);
    const polled = core.requests.slice(before);

    const snapshots = polled.filter((request) => request.path === '/api/v1/evaluator/snapshot');
    const lists = polled.filter((request) => request.path === '/api/v1/evaluator/environments');
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    expect(lists.length).toBe(snapshots.length);
    // A pause of one interval between polls, rather than a burst.
    expect(snapshots.length).toBeLessThanOrEqual(6);
    for (const request of [...snapshots, ...lists]) {
      expect(request.ifNoneMatch).toMatch(/^"[^"]+"$/);
      expect(request.status).toBe(304);
    }
    expect(snapshots.every((request) => request.sdkKey === 'ctff-env-production')).toBe(true);
  });

  it('picks up changed targeting within one poll interval', async () => {
    const { core, evaluator } = await start();
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    expect(await client.variation('rare-bird-alerts', alice, true)).toBe(false);

    core.put('ctff-env-production', environment('production', [flag('rare-bird-alerts', { on: true, version: 2 })]));
    const changed = performance.now();
    await expect.poll(() => client.variation('rare-bird-alerts', alice, false), { interval: 10 }).toBe(true);
    // One interval, plus the time a poll and an evaluation take.
    expect(performance.now() - changed).toBeLessThan(pollIntervalMs * 3);
  });

  it('starts serving environments that are added, and stops serving those that are deleted', async () => {
    const { core, evaluator } = await start();
    const development = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-development' });
    const production = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    expect((await development.variationDetail('rare-bird-alerts', alice, false)).reason).toEqual({
      kind: 'ERROR',
      errorKind: 'UNKNOWN_SDK_KEY',
    });

    core.put('ctff-env-development', environment('development', [flag('rare-bird-alerts', { on: true })]));
    await expect.poll(() => development.variation('rare-bird-alerts', alice, false)).toBe(true);

    core.remove('ctff-env-production');
    await expect
      .poll(async () => (await production.variationDetail('rare-bird-alerts', alice, false)).reason)
      .toEqual({ kind: 'ERROR', errorKind: 'UNKNOWN_SDK_KEY' });
  });

  it('keeps serving its last good snapshot while Core is down, and catches up once it is back', async () => {
    const { core, evaluator } = await start();
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    core.put('ctff-env-production', environment('production', [flag('rare-bird-alerts', { on: true, version: 2 })]));
    await expect.poll(() => client.variation('rare-bird-alerts', alice, false)).toBe(true);

    await core.stop();
    await sleep(pollIntervalMs * 4);
    expect(await evaluator.isReady()).toBe(true);
    expect(await client.variationDetail('rare-bird-alerts', alice, false)).toEqual({
      value: true,
      variationIndex: 0,
      reason: { kind: 'DEFAULT' },
    });
    expect(
      evaluator.logs.some(
        (entry) => entry['msg'] === 'Polling Core failed; serving the last good snapshots until it succeeds',
      ),
    ).toBe(true);

    core.put('ctff-env-production', environment('production', [flag('rare-bird-alerts', { version: 3 })]));
    await core.restart();
    await expect.poll(() => client.variation('rare-bird-alerts', alice, true)).toBe(false);
  });

  it('keeps serving its last good snapshot while Core answers with errors', async () => {
    const { core, evaluator } = await start();
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    core.setAvailable(false);
    const before = core.requests.length;
    await expect.poll(() => core.requests.length).toBeGreaterThan(before + 2);
    expect(await client.variation('rare-bird-alerts', alice, true)).toBe(false);
  });

  it('never logs the SDK key', async () => {
    const { evaluator } = await start();
    const client = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    await client.variation('rare-bird-alerts', alice, false);
    await expect
      .poll(() =>
        evaluator.logs.some((entry) => (entry['req'] as { url?: string } | undefined)?.url?.includes('/evaluate/')),
      )
      .toBe(true);
    expect(JSON.stringify(evaluator.logs)).not.toContain('ctff-env-production');
  });
});
