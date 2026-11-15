import 'reflect-metadata';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { pino } from 'pino';
import { AppModule } from './app.module.js';
import { configureRoutes, createOpenApiDocument } from './app.js';

/**
 * Writes Core's OpenAPI document to the given path, or with `--check` fails when the file there differs from it.
 * No database is needed: the app is created in preview mode, which reads the controllers without instantiating
 * providers. The core-api-client is generated from the document at libs/core-api-client/openapi.json: Core's
 * build checks it (`build`), and `pnpm nx run @ctff/core:openapi` refreshes it.
 */
const args = process.argv.slice(2);
const check = args.includes('--check');
const [target] = args.filter((arg) => arg !== '--check');
if (!target) {
  console.error('Usage: node dist/export-openapi.js [--check] <openapi.json>');
  process.exit(2);
}

const logger = pino({ level: 'silent' });
const app = await NestFactory.create(
  AppModule.forRoot(
    {
      databaseUrl: 'postgres://unused',
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      adminEnabled: false,
      retentionIntervalMs: 1,
    },
    logger,
  ),
  { preview: true, logger: false },
);
configureRoutes(app);
const document = `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`;
await app.close();

const path = resolve(target);
if (!check) {
  await writeFile(path, document);
} else if ((await readFile(path, 'utf8').catch(() => '')) !== document) {
  console.error(
    `${path} is not Core's current OpenAPI document, so the core-api-client generated from it is stale. ` +
      'Refresh it with `pnpm nx run @ctff/core:openapi` and commit it.',
  );
  process.exit(1);
}
