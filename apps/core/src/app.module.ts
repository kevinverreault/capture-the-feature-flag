import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Logger } from 'pino';
import type { CoreConfig } from './config.js';
import { DatabaseModule } from './database/database.module.js';
import { EnvironmentsModule } from './environments/environments.module.js';
import { EvaluatorModule } from './evaluator/evaluator.module.js';
import { FlagsModule } from './flags/flags.module.js';
import { HealthController } from './health/health.controller.js';
import { ProjectsModule } from './projects/projects.module.js';
import { TargetingModule } from './targeting/targeting.module.js';

@Module({})
export class AppModule {
  static forRoot(config: CoreConfig, logger: Logger): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: { logger, autoLogging: { ignore: (req) => req.url?.startsWith('/health/') ?? false } },
        }),
        DatabaseModule.forRoot(config.databaseUrl),
        ProjectsModule,
        EnvironmentsModule,
        FlagsModule,
        TargetingModule,
        EvaluatorModule,
      ],
      controllers: [HealthController],
    };
  }
}
