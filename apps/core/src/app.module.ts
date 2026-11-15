import { type DynamicModule, Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Logger } from 'pino';
import { CORE_CONFIG, type CoreConfig } from './config.js';
import { DatabaseModule } from './database/database.module.js';
import { EnvironmentsModule } from './environments/environments.module.js';
import { EvaluatorModule } from './evaluator/evaluator.module.js';
import { FlagsModule } from './flags/flags.module.js';
import { HealthController } from './health/health.controller.js';
import { ProjectsModule } from './projects/projects.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { TargetingModule } from './targeting/targeting.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';

/** Provides the CoreConfig to every module, as CORE_CONFIG. */
@Global()
@Module({})
class ConfigModule {
  static forRoot(config: CoreConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CORE_CONFIG, useValue: config }],
      exports: [CORE_CONFIG],
    };
  }
}

@Module({})
export class AppModule {
  static forRoot(config: CoreConfig, logger: Logger): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: { logger, autoLogging: { ignore: (req) => req.url?.startsWith('/health/') ?? false } },
        }),
        ConfigModule.forRoot(config),
        DatabaseModule.forRoot(config.databaseUrl),
        ProjectsModule,
        EnvironmentsModule,
        FlagsModule,
        TargetingModule,
        EvaluatorModule,
        SettingsModule,
        TelemetryModule,
      ],
      controllers: [HealthController],
    };
  }
}
