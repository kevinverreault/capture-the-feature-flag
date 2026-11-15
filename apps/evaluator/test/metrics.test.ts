import { sdkKeyHeader } from '@ctff/evaluation';
import { createClient } from '@ctff/sdk';
import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { environment, flag, pollIntervalMs, startEvaluator, type RunningEvaluator } from './support/evaluator.js';
import { startFakeCore, type FakeCore } from './support/fake-core.js';

/** One sample of a Prometheus text exposition: `name{label="value",…} number`. */
interface Sample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

function parse(text: string): Sample[] {
  return text
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const match = /^(?<name>[a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(?<labels>.*)\})? (?<value>\S+)$/.exec(line);
      if (!match?.groups?.['name']) throw new Error(`Not a Prometheus sample: ${line}`);
      const { name, labels: rawLabels = '', value } = match.groups;
      const labels: Record<string, string> = {};
      for (const label of rawLabels.matchAll(/(?<key>\w+)="(?<value>(?:[^"\\]|\\.)*)"/g)) {
        const { key, value: labelValue } = label.groups ?? {};
        if (key !== undefined && labelValue !== undefined) labels[key] = labelValue;
      }
      return { name, labels, value: Number(value) };
    });
}

describe('Prometheus metrics', () => {
  let core: FakeCore | undefined;
  let evaluator: RunningEvaluator | undefined;
  afterEach(async () => {
    await evaluator?.stop();
    await core?.stop();
    evaluator = undefined;
    core = undefined;
  });

  const alice = { user_id: 'alice', country: 'CA' };

  async function start(): Promise<{ core: FakeCore; evaluator: RunningEvaluator }> {
    core = await startFakeCore();
    core.put('ctff-env-production', environment('production', [flag('rare-bird-alerts', { on: true })]));
    core.put('ctff-env-development', environment('development', [flag('rare-bird-alerts')]));
    // Listed, but its snapshot fails to parse as one, so the Evaluator answers NOT_READY for it.
    core.put('ctff-env-broken', { projectKey: 'birdwatch', environmentKey: 'broken' } as never);
    evaluator = await startEvaluator(core.url);
    await evaluator.waitUntilReady();
    return { core, evaluator };
  }

  async function scrape(url: string): Promise<{ contentType: string | null; samples: Sample[] }> {
    const response = await fetch(`${url}/metrics`);
    expect(response.status).toBe(200);
    return { contentType: response.headers.get('content-type'), samples: parse(await response.text()) };
  }

  const value = (samples: Sample[], name: string, labels: Record<string, string>) =>
    samples.find(
      (sample) => sample.name === name && Object.entries(labels).every(([key, v]) => sample.labels[key] === v),
    )?.value;

  it('counts evaluation requests per environment and result', async () => {
    const { evaluator } = await start();
    const production = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    const development = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-development' });
    const unknown = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-nowhere' });
    const broken = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-broken' });
    expect((await broken.variationDetail('rare-bird-alerts', alice, false)).reason).toEqual({
      kind: 'ERROR',
      errorKind: 'NOT_READY',
    });
    await production.variation('rare-bird-alerts', alice, false);
    await production.variation('rare-bird-alerts', alice, false);
    await production.variation('no-such-flag', alice, false);
    await development.variation('rare-bird-alerts', alice, true);
    await unknown.variation('rare-bird-alerts', alice, true);
    await production.allFlags(alice);

    const { contentType, samples } = await scrape(evaluator.url);
    expect(contentType).toMatch(/^text\/plain;.*version=0\.0\.4/);
    const requests = (labels: Record<string, string>) =>
      value(samples, 'ctff_evaluator_evaluation_requests_total', labels);
    expect(requests({ project_key: 'birdwatch', environment_key: 'production', result: 'DEFAULT' })).toBe(2);
    expect(requests({ project_key: 'birdwatch', environment_key: 'production', result: 'FLAG_NOT_FOUND' })).toBe(1);
    expect(requests({ project_key: 'birdwatch', environment_key: 'development', result: 'OFF' })).toBe(1);
    // A bulk evaluation answers several reasons at once, so it counts as one BULK request.
    expect(requests({ project_key: 'birdwatch', environment_key: 'production', result: 'BULK' })).toBe(1);
    // An unknown SDK key names no environment, and the SDK key itself never becomes a label.
    expect(requests({ project_key: '', environment_key: '', result: 'UNKNOWN_SDK_KEY' })).toBe(1);
    expect(requests({ project_key: 'birdwatch', environment_key: 'broken', result: 'NOT_READY' })).toBe(1);
    expect(JSON.stringify(samples)).not.toContain('ctff-env-');
  });

  it('counts and times requests that never reach evaluation: a body that is not JSON, or no SDK key', async () => {
    const { evaluator } = await start();
    const post = (headers: Record<string, string>, body: string) =>
      fetch(`${evaluator.url}/api/v1/evaluate/rare-bird-alerts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body,
      });
    expect((await post({ [sdkKeyHeader]: 'ctff-env-production' }, '{not json')).status).toBe(400);
    expect((await post({}, JSON.stringify({ context: alice }))).status).toBe(400);

    const { samples } = await scrape(evaluator.url);
    const production = { project_key: 'birdwatch', environment_key: 'production' };
    const noEnvironment = { project_key: '', environment_key: '' };
    expect(value(samples, 'ctff_evaluator_evaluation_requests_total', { ...production, result: 'HTTP_400' })).toBe(1);
    expect(
      value(samples, 'ctff_evaluator_evaluation_requests_total', { ...noEnvironment, result: 'MISSING_SDK_KEY' }),
    ).toBe(1);
    expect(value(samples, 'ctff_evaluator_evaluation_duration_seconds_count', production)).toBe(1);
  });

  it('counts and times requests the client abandons before the answer, as ABORTED', async () => {
    const { evaluator } = await start();
    // Announces a body it never finishes sending, then hangs up.
    await new Promise<void>((resolve) => {
      const abandoned = request(`${evaluator.url}/api/v1/evaluate/rare-bird-alerts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '100', [sdkKeyHeader]: 'ctff-env-production' },
      });
      abandoned.on('error', () => resolve());
      abandoned.write('{"context":', () => setTimeout(() => abandoned.destroy(), 100));
      abandoned.on('close', () => resolve());
    });

    const production = { project_key: 'birdwatch', environment_key: 'production' };
    await expect
      .poll(async () =>
        value((await scrape(evaluator.url)).samples, 'ctff_evaluator_evaluation_requests_total', {
          ...production,
          result: 'ABORTED',
        }),
      )
      .toBe(1);
    const { samples } = await scrape(evaluator.url);
    expect(value(samples, 'ctff_evaluator_evaluation_duration_seconds_sum', production)).toBeGreaterThanOrEqual(0.1);
  });

  it('records the latency of evaluation requests in a histogram per environment, with buckets around 10 ms', async () => {
    const { evaluator } = await start();
    const production = createClient({ evaluatorUrl: evaluator.url, sdkKey: 'ctff-env-production' });
    for (let i = 0; i < 5; i++) await production.variation('rare-bird-alerts', alice, false);

    const { samples } = await scrape(evaluator.url);
    const productionLabels = { project_key: 'birdwatch', environment_key: 'production' };
    const name = 'ctff_evaluator_evaluation_duration_seconds';
    expect(value(samples, `${name}_count`, productionLabels)).toBe(5);
    const sum = value(samples, `${name}_sum`, productionLabels);
    expect(sum).toBeGreaterThan(0);
    // Five local evaluations take well under a second in all.
    expect(sum).toBeLessThan(1);
    expect(value(samples, `${name}_bucket`, { ...productionLabels, le: '+Inf' })).toBe(5);
    expect(value(samples, `${name}_bucket`, { ...productionLabels, le: '0.01' })).toBeDefined();
    expect(value(samples, `${name}_bucket`, { ...productionLabels, le: '0.005' })).toBeDefined();
  });

  it('reports the age of every snapshot held, which grows while Core is unreachable', async () => {
    const { core, evaluator } = await start();
    const age = async (environmentKey: string) =>
      value((await scrape(evaluator.url)).samples, 'ctff_evaluator_snapshot_age_seconds', {
        project_key: 'birdwatch',
        environment_key: environmentKey,
      });

    // Every poll confirms the snapshots (with a 304), so their age stays under a couple of poll intervals.
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs * 6));
    for (const environmentKey of ['production', 'development']) {
      expect(await age(environmentKey)).toBeGreaterThanOrEqual(0);
      expect(await age(environmentKey)).toBeLessThan((pollIntervalMs * 3) / 1000);
    }

    await core.stop();
    await expect.poll(() => age('production'), { timeout: 5_000 }).toBeGreaterThan((pollIntervalMs * 5) / 1000);

    core.remove('ctff-env-development');
    await core.restart();
    await expect.poll(() => age('production')).toBeLessThan((pollIntervalMs * 3) / 1000);
    await expect.poll(() => age('development')).toBeUndefined();
  });

  it('serves the metrics outside /api/v1, and keeps scrapes out of the request logs', async () => {
    const { evaluator } = await start();
    await scrape(evaluator.url);
    await scrape(evaluator.url);
    expect((await fetch(`${evaluator.url}/api/v1/metrics`)).status).toBe(404);
    await expect
      .poll(() =>
        evaluator.logs.some((entry) => (entry['req'] as { url?: string } | undefined)?.url === '/api/v1/metrics'),
      )
      .toBe(true);
    expect(evaluator.logs.some((entry) => (entry['req'] as { url?: string } | undefined)?.url === '/metrics')).toBe(
      false,
    );
  });
});
