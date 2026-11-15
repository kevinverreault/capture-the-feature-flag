import 'reflect-metadata';
import {
  type AllFlags,
  type Context,
  CtffClient,
  type CtffContextResolver,
  CtffModule,
  Flags,
  RequireFlag,
} from '@ctff/nestjs';
import { Controller, Get, Inject, type INestApplication, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startCountingProxy, type CountingProxy } from './support/counting-proxy.js';
import { environment, flag, startEvaluator, type RunningEvaluator } from './support/evaluator.js';
import { startFakeCore, type FakeCore } from './support/fake-core.js';

/** The app's context resolver: a stand-in for one that reads a JWT, it reads the birder from two headers. */
@Injectable()
class HeaderContextResolver implements CtffContextResolver<Request> {
  resolve(request: Request): Context {
    return { user_id: request.header('x-birder'), country: request.header('x-country') };
  }
}

@Injectable()
class SightingService {
  constructor(@Inject(CtffClient) private readonly flags: CtffClient) {}

  showsRareBirdAlerts(context: Context): Promise<boolean> {
    return this.flags.variation('rare-bird-alerts', context, false);
  }
}

@Controller()
class SightingController {
  constructor(@Inject(SightingService) private readonly sightings: SightingService) {}

  @Get('sightings')
  sightingsFeed(@Flags() flags: AllFlags, @Flags() again: AllFlags): { flags: AllFlags; sameFlags: boolean } {
    return { flags, sameFlags: flags === again };
  }

  @Get('photo-id')
  @RequireFlag('photo-id-beta')
  photoId(): { photoId: string } {
    return { photoId: 'great-blue-heron' };
  }

  @Get('sighting-form')
  @RequireFlag('new-sighting-form')
  sightingForm(@Flags() flags: AllFlags): { form: string; flags: AllFlags } {
    return { form: 'new', flags };
  }

  @Get('archived-feature')
  @RequireFlag('no-such-flag')
  archivedFeature(): { ok: true } {
    return { ok: true };
  }

  @Get('rare-bird-alerts')
  async rareBirdAlerts(): Promise<{ alerts: boolean }> {
    return { alerts: await this.sightings.showsRareBirdAlerts({ user_id: 'alice', country: 'CA' }) };
  }
}

async function startApp(ctff: ReturnType<typeof CtffModule.forRoot>): Promise<{ app: INestApplication; url: string }> {
  const moduleRef = await Test.createTestingModule({
    imports: [ctff],
    controllers: [SightingController],
    providers: [SightingService],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  return { app, url: await app.getUrl() };
}

describe('the NestJS module', () => {
  let core: FakeCore;
  let evaluator: RunningEvaluator;
  let proxy: CountingProxy;
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    core = await startFakeCore();
    core.put(
      'ctff-env-development',
      environment('development', [
        flag('new-sighting-form', { on: true }),
        flag('photo-id-beta'),
        flag('rare-bird-alerts', { on: true }),
      ]),
    );
    evaluator = await startEvaluator(core.url);
    await evaluator.waitUntilReady();
    proxy = await startCountingProxy(evaluator.url);
    ({ app, url } = await startApp(
      CtffModule.forRoot({
        evaluatorUrl: proxy.url,
        sdkKey: 'ctff-env-development',
        contextResolver: HeaderContextResolver,
      }),
    ));
  });
  afterAll(async () => {
    await app?.close();
    await proxy?.stop();
    await evaluator?.stop();
    await core?.stop();
  });
  beforeEach(() => void proxy.requests.splice(0));

  const asAlice = { 'x-birder': 'alice', 'x-country': 'CA' };

  it('@Flags() loads every flag with one Evaluator call per request, for the context the resolver builds', async () => {
    const response = await fetch(`${url}/sightings`, { headers: asAlice });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      flags: {
        values: { 'new-sighting-form': true, 'photo-id-beta': false, 'rare-bird-alerts': true },
        details: {
          'new-sighting-form': { value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } },
          'photo-id-beta': { value: false, variationIndex: 1, reason: { kind: 'OFF' } },
          'rare-bird-alerts': { value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } },
        },
        error: null,
      },
      sameFlags: true,
    });
    expect(proxy.requests).toEqual([
      { method: 'POST', path: '/api/v1/evaluate', body: { context: { user_id: 'alice', country: 'CA' } } },
    ]);
  });

  it('@Flags() loads the flags again for the next request, with that request’s context', async () => {
    await fetch(`${url}/sightings`, { headers: asAlice });
    await fetch(`${url}/sightings`, { headers: { 'x-birder': 'bob', 'x-country': 'FR' } });
    expect(proxy.requests.map((request) => request.body)).toEqual([
      { context: { user_id: 'alice', country: 'CA' } },
      { context: { user_id: 'bob', country: 'FR' } },
    ]);
  });

  it('@RequireFlag answers 404 when the flag serves false', async () => {
    const response = await fetch(`${url}/photo-id`, { headers: asAlice });
    expect(response.status).toBe(404);
    expect(proxy.requests).toHaveLength(1);
  });

  it('@RequireFlag answers 404 when the flag serves no variation', async () => {
    expect((await fetch(`${url}/archived-feature`, { headers: asAlice })).status).toBe(404);
  });

  it('@RequireFlag lets the request through when the flag serves true, sharing the call with @Flags()', async () => {
    const response = await fetch(`${url}/sighting-form`, { headers: asAlice });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ form: 'new', flags: { values: { 'new-sighting-form': true } } });
    expect(proxy.requests).toHaveLength(1);
  });

  it('serves the switched targeting from the next request on, since nothing is cached across requests', async () => {
    expect((await fetch(`${url}/photo-id`, { headers: asAlice })).status).toBe(404);
    core.put(
      'ctff-env-development',
      environment('development', [
        flag('new-sighting-form', { on: true }),
        flag('photo-id-beta', { on: true, version: 2 }),
        flag('rare-bird-alerts', { on: true }),
      ]),
    );
    await expect.poll(async () => (await fetch(`${url}/photo-id`, { headers: asAlice })).status).toBe(200);
  });

  it('provides an injectable CtffClient', async () => {
    const response = await fetch(`${url}/rare-bird-alerts`);
    expect(await response.json()).toEqual({ alerts: true });
    expect(proxy.requests).toEqual([
      {
        method: 'POST',
        path: '/api/v1/evaluate/rare-bird-alerts',
        body: { context: { user_id: 'alice', country: 'CA' } },
      },
    ]);
  });
});

describe('the NestJS module, configured with forRootAsync()', () => {
  let core: FakeCore;
  let evaluator: RunningEvaluator;
  let app: INestApplication | undefined;
  beforeAll(async () => {
    core = await startFakeCore();
    core.put('ctff-env-production', environment('production', [flag('new-sighting-form', { on: true })]));
    evaluator = await startEvaluator(core.url);
    await evaluator.waitUntilReady();
  });
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });
  afterAll(async () => {
    await evaluator?.stop();
    await core?.stop();
  });

  /** A stand-in for the app's configuration module. */
  @Module({ providers: [{ provide: 'EVALUATOR_URL', useFactory: () => evaluator.url }], exports: ['EVALUATOR_URL'] })
  class ConfigModule {}

  it('configures the SDK from injected providers', async () => {
    let url: string;
    ({ app, url } = await startApp(
      CtffModule.forRootAsync({
        imports: [ConfigModule],
        inject: ['EVALUATOR_URL'],
        useFactory: async (evaluatorUrl: string) => ({ evaluatorUrl, sdkKey: 'ctff-env-production' }),
        contextResolver: HeaderContextResolver,
      }),
    ));
    expect((await fetch(`${url}/sighting-form`)).status).toBe(200);
  });

  it('turns an unknown SDK key into no flags, so @RequireFlag answers 404 and @Flags() reports the error', async () => {
    let url: string;
    ({ app, url } = await startApp(
      CtffModule.forRootAsync({
        imports: [ConfigModule],
        inject: ['EVALUATOR_URL'],
        useFactory: (evaluatorUrl: string) => ({ evaluatorUrl, sdkKey: 'ctff-env-unknown' }),
        contextResolver: HeaderContextResolver,
      }),
    ));
    expect((await fetch(`${url}/sighting-form`)).status).toBe(404);
    const response = await fetch(`${url}/sightings`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      flags: { values: {}, details: {}, error: 'UNKNOWN_SDK_KEY' },
      sameFlags: true,
    });
  });
});
