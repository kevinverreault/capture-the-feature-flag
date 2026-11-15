import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as NestPinoLogger } from 'nestjs-pino';
import type { Logger } from 'pino';
import { AppModule } from './app.module.js';
import type { BirdwatchApiConfig } from './config.js';

export const apiPrefix = 'api';

export async function createApp(config: BirdwatchApiConfig, sdkKey: string, logger: Logger): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config, sdkKey, logger), {
    bufferLogs: true,
  });
  app.useLogger(app.get(NestPinoLogger));
  app.disable('x-powered-by');
  app.setGlobalPrefix(apiPrefix, { exclude: ['health/live', 'health/ready'] });
  app.enableShutdownHooks();
  return app;
}
