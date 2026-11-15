import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Logger } from 'pino';
import type { EvaluatorConfig } from './config.js';
import { EvaluationController } from './evaluation/evaluation.controller.js';
import { HealthController } from './health/health.controller.js';
import { EvaluatorMetrics } from './metrics/evaluator-metrics.js';
import { MetricsController } from './metrics/metrics.controller.js';
import { SnapshotPoller } from './snapshots/snapshot-poller.js';
import { TelemetryRecorder } from './telemetry/telemetry-recorder.js';

/** Probes and scrapes, which come every few seconds and would drown the request logs. */
const quietPaths = ['/health/', '/metrics'];

@Module({})
export class AppModule {
  static forRoot(config: EvaluatorConfig, logger: Logger): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            logger,
            autoLogging: { ignore: (req) => quietPaths.some((path) => req.url?.startsWith(path) ?? false) },
          },
        }),
      ],
      controllers: [EvaluationController, HealthController, MetricsController],
      providers: [
        {
          provide: SnapshotPoller,
          useValue: new SnapshotPoller({ ...config, logger: logger.child({ component: 'snapshot-poller' }) }),
        },
        {
          provide: TelemetryRecorder,
          useValue: new TelemetryRecorder({ ...config, logger: logger.child({ component: 'telemetry' }) }),
        },
        {
          provide: EvaluatorMetrics,
          useFactory: (snapshots: SnapshotPoller) => new EvaluatorMetrics(snapshots),
          inject: [SnapshotPoller],
        },
      ],
    };
  }
}
