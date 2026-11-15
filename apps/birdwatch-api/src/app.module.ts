import { CtffModule } from '@ctff/nestjs';
import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import type { Logger } from 'pino';
import type { BirdwatchApiConfig } from './config.js';
import { HealthController } from './health/health.controller.js';
import { AuthGuard } from './session/auth.guard.js';
import { BirderContextResolver } from './session/birder-context.resolver.js';
import { SessionController } from './session/session.controller.js';
import { SightingStore } from './sightings/sighting-store.js';
import { SightingsController } from './sightings/sightings.controller.js';
import { SpeciesController } from './species/species.controller.js';
import { BIRDWATCH_API_CONFIG } from './tokens.js';

@Module({})
export class AppModule {
  static forRoot(config: BirdwatchApiConfig, sdkKey: string, logger: Logger): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: { logger, autoLogging: { ignore: (req) => req.url?.startsWith('/health/') ?? false } },
        }),
        CtffModule.forRoot({
          evaluatorUrl: config.evaluatorUrl,
          sdkKey,
          timeoutMs: config.evaluatorTimeoutMs,
          contextResolver: BirderContextResolver,
        }),
      ],
      controllers: [SessionController, SightingsController, SpeciesController, HealthController],
      providers: [
        { provide: BIRDWATCH_API_CONFIG, useValue: config },
        // Global guards run before route guards, so `@RequireFlag` sees the birder.
        { provide: APP_GUARD, useClass: AuthGuard },
        SightingStore,
      ],
      exports: [BIRDWATCH_API_CONFIG],
    };
  }
}
