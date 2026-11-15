import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { pino } from 'pino';
import { AppModule } from './app.module.js';
import { configureRoutes, createOpenApiDocument } from './app.js';

/**
 * Writes Core's OpenAPI document to the path given as the only argument, without a database: the app is created
 * in preview mode, which reads the controllers without instantiating providers. The core-api-client is generated
 * from the document this writes (`pnpm nx run @ctff/core:openapi`).
 */
const [target] = process.argv.slice(2);
if (!target) {
  console.error('Usage: node dist/export-openapi.js <output.json>');
  process.exit(2);
}

const logger = pino({ level: 'silent' });
const app = await NestFactory.create(
  AppModule.forRoot(
    { databaseUrl: 'postgres://unused', host: '127.0.0.1', port: 0, logLevel: 'silent', adminEnabled: false },
    logger,
  ),
  { preview: true, logger: false },
);
configureRoutes(app);
const document = createOpenApiDocument(app);
await writeFile(resolve(target), `${JSON.stringify(document, null, 2)}\n`);
await app.close();
