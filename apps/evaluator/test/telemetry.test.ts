import { type EvaluationCount, minuteOf, type TelemetryBatch } from '@ctff/evaluation';
import { createClient } from '@ctff/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { environment, flag, startEvaluator, type RunningEvaluator } from './support/evaluator.js';
import { startFakeCore, type FakeCore } from './support/fake-core.js';

/** How often the Evaluator sends telemetry to Core in these tests. */
const flushIntervalMs = 300;

describe('evaluation telemetry', () => {
  let core: FakeCore | undefined;
  let evaluator: RunningEvaluator | undefined;
  afterEach(async () => {
    await evaluator?.stop();
    await core?.stop();
    evaluator = undefined;
    core = undefined;
  });

  async function start(env: Record<string, string> = {}): Promise<{ core: FakeCore; evaluator: RunningEvaluator }> {
    core = await startFakeCore();
    core.put(
      'ctff-env-production',
      environment('production', [flag('rare-bird-alerts', { on: true }), flag('photo-id-beta')]),
    );
    core.put('ctff-env-development', environment('development', [flag('rare-bird-alerts')]));
    evaluator = await startEvaluator(core.url, { TELEMETRY_FLUSH_INTERVAL_MS: String(flushIntervalMs), ...env });
    await evaluator.waitUntilReady();
    return { core, evaluator };
  }

  /** The counts of every batch so far, added up per SDK key, flag, variation and minute. */
  function totals(batches: TelemetryBatch[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const batch of batches) {
      for (const { sdkKey, counts } of batch.environments) {
        for (const { flagKey, variationIndex, minute, count } of counts) {
          const key = `${sdkKey} ${flagKey} ${variationIndex} ${minute}`;
          result[key] = (result[key] ?? 0) + count;
        }
      }
    }
    return result;
  }

  /**
   * Runs `burst` (which takes well under 5 s) within one minute and returns that minute, so its counts land in a
   * single bucket. Too close to the end of a minute, it waits for the next one first.
   */
  async function withinOneMinute(burst: () => Promise<void>): Promise<string> {
    const untilNextMinute = 60_000 - (Date.now() % 60_000);
    if (untilNextMinute < 5_000) await new Promise((resolve) => setTimeout(resolve, untilNextMinute + 10));
    const minute = minuteOf(Date.now());
    await burst();
    expect(minuteOf(Date.now())).toBe(minute);
    return minute;
  }

  it('sends Core the number of evaluations per flag, environment, variation and minute', async () => {
    const { core, evaluator } = await start();
    const production = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    const development = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-development' });

    const minute = await withinOneMinute(async () => {
      for (let i = 0; i < 5; i += 1) await production.variation('rare-bird-alerts', { user_id: `u${i}` }, false);
      for (let i = 0; i < 3; i += 1) await production.variation('photo-id-beta', { country: 'CA' }, false);
      for (let i = 0; i < 2; i += 1) await development.variation('rare-bird-alerts', {}, false);
      // Neither of these serves a variation, so neither is counted.
      await production.variation('no-such-flag', {}, false);
      await production.variation('rare-bird-alerts', { country: 'Canada' }, false);
    });

    await expect
      .poll(() => totals(core.telemetry), { timeout: flushIntervalMs * 10 })
      .toEqual({
        [`ctff-env-production rare-bird-alerts 0 ${minute}`]: 5,
        [`ctff-env-production photo-id-beta 1 ${minute}`]: 3,
        [`ctff-env-development rare-bird-alerts 1 ${minute}`]: 2,
      });
    const counts: EvaluationCount[] = core.telemetry.flatMap((batch) =>
      batch.environments.flatMap((entry) => entry.counts),
    );
    // Added up in the Evaluator: one entry per bucket and batch, not one per evaluation.
    expect(counts.length).toBeLessThanOrEqual(3 * core.telemetry.length);
  });

  /** The seen contexts of every batch so far for an SDK key, by context, with the latest last-seen of each. */
  function seen(batches: TelemetryBatch[], sdkKey: string): Map<string, string> {
    const result = new Map<string, string>();
    for (const batch of batches) {
      for (const entry of batch.environments.filter((candidate) => candidate.sdkKey === sdkKey)) {
        for (const { context, lastSeen } of entry.seenContexts) {
          const key = JSON.stringify(context);
          const previous = result.get(key);
          if (previous === undefined || previous < lastSeen) result.set(key, lastSeen);
        }
      }
    }
    return result;
  }

  it('sends Core each context it evaluated once per batch, with when it was last seen', async () => {
    const { core, evaluator } = await start({ TELEMETRY_FLUSH_INTERVAL_MS: '60000' });
    const production = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });

    const before = new Date().toISOString();
    await production.variation('rare-bird-alerts', { user_id: 'alice', country: 'ca' }, false);
    await production.variation('photo-id-beta', { user_id: 'bram', country: 'NL' }, false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const between = new Date().toISOString();
    await production.variation('photo-id-beta', { user_id: 'alice', country: 'CA' }, false);
    // Seen even though the flag is unknown; a context without attributes, or a malformed one, is not.
    await production.variation('no-such-flag', { country: 'FR' }, false);
    await production.variation('rare-bird-alerts', {}, false);
    await production.variation('rare-bird-alerts', { user_id: '' }, false);
    const after = new Date().toISOString();

    // Stopping flushes what is left, without waiting for the interval.
    await evaluator.stop();
    expect(core.telemetry).toHaveLength(1);
    const [entry] = core.telemetry[0]?.environments ?? [];
    expect(entry?.sdkKey).toBe('ctff-env-production');
    expect(entry?.seenContexts.map(({ context }) => context)).toEqual(
      expect.arrayContaining([
        { user_id: 'alice', country: 'CA' },
        { user_id: 'bram', country: 'NL' },
        { country: 'FR' },
      ]),
    );
    expect(entry?.seenContexts).toHaveLength(3);
    const lastSeen = seen(core.telemetry, 'ctff-env-production');
    const alice = lastSeen.get(JSON.stringify({ user_id: 'alice', country: 'CA' })) ?? '';
    const bram = lastSeen.get(JSON.stringify({ user_id: 'bram', country: 'NL' })) ?? '';
    expect(bram >= before && bram <= between).toBe(true);
    expect(alice >= between && alice <= after).toBe(true);
  });

  it('holds at most the configured number of seen contexts per environment between flushes, the most recent', async () => {
    const { core, evaluator } = await start({ TELEMETRY_FLUSH_INTERVAL_MS: '60000', TELEMETRY_MAX_SEEN_CONTEXTS: '3' });
    const production = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    const development = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-development' });
    for (const userId of ['u1', 'u2', 'u3', 'u4', 'u2', 'u5']) {
      await production.variation('rare-bird-alerts', { user_id: userId }, false);
    }
    await development.variation('rare-bird-alerts', { user_id: 'u1' }, false);

    await evaluator.stop();
    const users = (sdkKey: string) => [...seen(core.telemetry, sdkKey).keys()].map((key) => JSON.parse(key).user_id);
    expect(users('ctff-env-production').sort()).toEqual(['u2', 'u4', 'u5']);
    expect(users('ctff-env-development')).toEqual(['u1']);
  });

  it('drops a batch Core does not accept, and keeps evaluating and sending', async () => {
    const { core, evaluator } = await start();
    const production = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    core.setAvailable(false);
    await production.variation('rare-bird-alerts', { user_id: 'lost' }, false);
    await expect.poll(() => core.requests.some((request) => request.path === '/api/v1/evaluator/telemetry')).toBe(true);
    await expect
      .poll(() =>
        evaluator.logs.some(
          (entry) => entry['msg'] === 'Sending telemetry to Core failed; this batch is not sent again',
        ),
      )
      .toBe(true);

    core.setAvailable(true);
    expect(await production.variation('rare-bird-alerts', { user_id: 'kept' }, false)).toBe(true);
    await expect
      .poll(() => [...seen(core.telemetry, 'ctff-env-production').keys()])
      .toEqual([JSON.stringify({ user_id: 'kept' })]);
  });

  it('sends a large flush in several batches of at most the configured size, adding up to the whole', async () => {
    const { core, evaluator } = await start({
      TELEMETRY_FLUSH_INTERVAL_MS: '60000',
      TELEMETRY_MAX_BATCH_BYTES: '2000',
    });
    const production = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    const development = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-development' });
    const minute = await withinOneMinute(async () => {
      for (let i = 0; i < 60; i += 1) await production.variation('rare-bird-alerts', { user_id: `birder-${i}` }, false);
      for (let i = 0; i < 5; i += 1) await development.variation('rare-bird-alerts', { user_id: `dev-${i}` }, false);
    });

    await evaluator.stop();
    expect(core.telemetry.length).toBeGreaterThan(1);
    for (const batch of core.telemetry) expect(Buffer.byteLength(JSON.stringify(batch))).toBeLessThanOrEqual(2000);
    expect(totals(core.telemetry)).toEqual({
      [`ctff-env-production rare-bird-alerts 0 ${minute}`]: 60,
      [`ctff-env-development rare-bird-alerts 1 ${minute}`]: 5,
    });
    expect(seen(core.telemetry, 'ctff-env-production').size).toBe(60);
    expect(seen(core.telemetry, 'ctff-env-development').size).toBe(5);
  });
});
