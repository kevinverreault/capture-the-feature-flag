import 'reflect-metadata';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as NestPinoLogger } from 'nestjs-pino';
import type { Logger } from 'pino';
import { AppModule } from './app.module.js';
import type { CoreConfig } from './config.js';

export const apiPrefix = 'api/v1';

export async function createApp(config: CoreConfig, logger: Logger): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config, logger), {
    bufferLogs: true,
  });
  app.useLogger(app.get(NestPinoLogger));
  // ETags are set deliberately where they mean something (the snapshot endpoint), not on every response.
  app.set('etag', false);
  app.disable('x-powered-by');
  app.setGlobalPrefix(apiPrefix, { exclude: ['health/live', 'health/ready'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  // The OpenAPI document is generated from the controllers; the core-api-client is generated from it.
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Capture The Feature Flag Core API')
      .setDescription('Projects, environments, flags and targeting, and the endpoints Evaluators poll.')
      .setVersion('v1')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: `${apiPrefix}/openapi.json`,
    yamlDocumentUrl: `${apiPrefix}/openapi.yaml`,
  });
  return app;
}
