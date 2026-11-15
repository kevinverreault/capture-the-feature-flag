import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Logger } from 'pino';
import type { EvaluatorConfig } from './config.js';
import { EvaluationController } from './evaluation/evaluation.controller.js';
import { HealthController } from './health/health.controller.js';
import { SnapshotPoller } from './snapshots/snapshot-poller.js';
import { SnapshotPolling, snapshotPollerToken } from './snapshots/snapshot-polling.js';

@Module({})
export class AppModule {
  static forRoot(config: EvaluatorConfig, logger: Logger): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: { logger, autoLogging: { ignore: (req) => req.url?.startsWith('/health/') ?? false } },
        }),
      ],
      controllers: [EvaluationController, HealthController],
      providers: [
        {
          provide: snapshotPollerToken,
          useValue: new SnapshotPoller({
            coreUrl: config.coreUrl,
            pollIntervalMs: config.pollIntervalMs,
            coreTimeoutMs: config.coreTimeoutMs,
            logger: logger.child({ component: 'snapshot-poller' }),
          }),
        },
        SnapshotPolling,
      ],
    };
  }
}
