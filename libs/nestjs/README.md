# @ctff/nestjs

The NestJS module for Capture The Feature Flag. It configures [`@ctff/sdk`](../sdk/README.md) once for the app, and adds an injectable `CtffClient`, the `@Flags()` parameter decorator and the `@RequireFlag` guard. Evaluation stays remote: every call goes to an [Evaluator](../../apps/evaluator/README.md).

## Setup

Implement a `CtffContextResolver`, which builds the context to evaluate flags for from a request. It is created inside `CtffModule`, so it can inject global providers and those exported by the modules you pass in `imports` (in `forRoot()` and `forRootAsync()` alike), such as the app's JWT service:

```ts
import type { Context, CtffContextResolver } from '@ctff/nestjs';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class BirderContextResolver implements CtffContextResolver<Request> {
  resolve(request: Request): Context {
    const birder = request.user as { sub: string; country: string } | undefined;
    return birder ? { user_id: birder.sub, country: birder.country } : {};
  }
}
```

Then import the module once, in the root module. It is global, so everything below works in every module.

```ts
import { CtffModule } from '@ctff/nestjs';

@Module({
  imports: [
    CtffModule.forRoot({
      evaluatorUrl: 'http://evaluator:3000',
      sdkKey: 'ctff-env-…',
      timeoutMs: 500, // optional; this is the default
      contextResolver: BirderContextResolver,
    }),
  ],
})
export class AppModule {}
```

To configure it from injected providers, use `forRootAsync()`:

```ts
CtffModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    evaluatorUrl: config.getOrThrow('EVALUATOR_URL'),
    sdkKey: config.getOrThrow('CTFF_SDK_KEY'),
  }),
  contextResolver: BirderContextResolver,
});
```

A missing Evaluator URL or SDK key fails the app at startup.

## Use

```ts
import { type AllFlags, CtffClient, Flags, RequireFlag } from '@ctff/nestjs';

@Controller('sightings')
export class SightingController {
  constructor(private readonly ctff: CtffClient) {}

  // One flag, for a context built by hand.
  @Get('alerts')
  async alerts(@Query('country') country: string) {
    return { alerts: await this.ctff.variation('rare-bird-alerts', { country }, false) };
  }

  // Every flag, loaded once per request for the resolver's context.
  @Get()
  feed(@Flags() flags: AllFlags) {
    return { sightings: [], rareBirdAlerts: flags.values['rare-bird-alerts'] ?? false, flags };
  }

  // 404 unless the flag serves `true`.
  @Post()
  @RequireFlag('new-sighting-form')
  create() {}
}
```

- **`CtffClient`** is the SDK's own client (see [`@ctff/sdk`](../sdk/README.md)), with `variation`, `variationDetail` and `allFlags`, injected by the `CtffClient` class token. Use it in any provider, with a context you build yourself.
- **`@Flags()`** injects the result of `allFlags` for the context the resolver builds from the request (see [`allFlags`](../sdk/README.md#allflags)). However many times `@Flags()` and `@RequireFlag` are used for a request, it makes one Evaluator call. Nothing is cached across requests. Evaluator problems never fail a request: when the Evaluator can't be asked, `values` is empty and `error` says why, so look flags up with a fallback value. App-wide pipes see the loaded flags, like any other parameter. Only an exception from the resolver fails the request (see below).
- **`@RequireFlag(flagKey)`**, on a route or a controller, answers `404 Not Found` unless the flag serves `true`. A flag that serves no variation (unknown, archived, or the Evaluator unreachable) counts as `false`. When it is applied several times, every flag must serve `true`.

The resolver runs once per request, the first time `@RequireFlag` or `@Flags()` needs the flags, and its context is kept for the rest of the request. Whatever it reads, such as `request.user`, must be set by then: by middleware, a global guard, or a route guard written below `@RequireFlag`. Decorators apply from the bottom up, so in `@RequireFlag('photo-id-beta') @UseGuards(AuthGuard)` the auth guard runs first. An exception thrown by the resolver fails the request, like one thrown by any guard, and so does every other `@Flags()` and `@RequireFlag` of that request, since they share the one load. The module works with HTTP requests only.

The module is tested through the Evaluator's S3 suite ([apps/evaluator/test/nestjs.test.ts](../../apps/evaluator/test/nestjs.test.ts)).
