import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as NestPinoLogger } from 'nestjs-pino';
import type { Logger } from 'pino';
import { AppModule } from './app.module.js';
import type { EvaluatorConfig } from './config.js';
import { evaluationMetricsMiddleware } from './metrics/evaluation-metrics.middleware.js';
import { EvaluatorMetrics } from './metrics/evaluator-metrics.js';
import { SnapshotPoller } from './snapshots/snapshot-poller.js';

export const apiPrefix = 'api/v1';

export async function createApp(config: EvaluatorConfig, logger: Logger): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config, logger), {
    bufferLogs: true,
  });
  app.useLogger(app.get(NestPinoLogger));
  app.set('etag', false);
  app.disable('x-powered-by');
  app.setGlobalPrefix(apiPrefix, { exclude: ['health/live', 'health/ready', 'metrics'] });
  app.enableShutdownHooks();
  const metrics = app.get(EvaluatorMetrics);
  metrics.collectProcessMetrics();
  // Mounted before Nest's body parser (registered when the app initializes), so parsing is timed and a body that
  // isn't JSON still counts.
  app.use(`/${apiPrefix}/evaluate`, evaluationMetricsMiddleware(metrics, app.get(SnapshotPoller)));
  return app;
}
