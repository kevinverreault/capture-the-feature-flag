import { sdkKeyHeader } from '@ctff/evaluation';
import { pino } from 'pino';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { applyMigrations } from './database/migrate.js';
import { seedDemo } from './seed/demo-seed.js';

const config = loadConfig();
// SDK keys identify environments and will become credentials, so they never reach the logs.
const logger = pino({ level: config.logLevel, redact: [`req.headers["${sdkKeyHeader}"]`] });

try {
  await applyMigrations(config.databaseUrl, logger);
  const app = await createApp(config, logger);
  // Seeded before listening, so a ready Core already has the demo.
  if (config.seedDemo) await seedDemo(app, config.databaseUrl, logger);
  await app.listen(config.port, config.host);
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address !== null ? address.port : config.port;
  logger.info({ host: config.host, port }, 'Core listening');
} catch (error) {
  logger.fatal({ err: error }, 'Core failed to start');
  process.exit(1);
}
