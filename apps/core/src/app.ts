import 'reflect-metadata';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as NestPinoLogger } from 'nestjs-pino';
import type { Logger } from 'pino';
import { mountAdmin } from './admin.js';
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
  mountAdmin(app, config);
  configureRoutes(app);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  // The OpenAPI document is generated from the controllers; the core-api-client is generated from it.
  const document = createOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: `${apiPrefix}/openapi.json`,
    yamlDocumentUrl: `${apiPrefix}/openapi.yaml`,
  });
  return app;
}

/**
 * Configures the parts of the app the OpenAPI document reflects: the global prefix and its exclusions. Both
 * {@link createApp} and the offline export (export-openapi.ts) go through it, so they describe the same API.
 */
export function configureRoutes(app: INestApplication): void {
  app.setGlobalPrefix(apiPrefix, { exclude: ['health/live', 'health/ready'] });
}

/** The OpenAPI document of the versioned API, generated from the controllers. */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Capture The Feature Flag Core API')
      .setDescription('Projects, environments, flags and targeting, and the endpoints Evaluators poll.')
      .setVersion('v1')
      .build(),
  );
}
