import { pino } from 'pino';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { applyMigrations } from './database/migrate.js';

const config = loadConfig();
// SDK keys identify environments and will become credentials, so they never reach the logs.
const logger = pino({ level: config.logLevel, redact: ['req.headers["x-ctff-sdk-key"]'] });

try {
  await applyMigrations(config.databaseUrl, logger);
  const app = await createApp(config, logger);
  await app.listen(config.port, config.host);
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address !== null ? address.port : config.port;
  logger.info({ host: config.host, port }, 'Core listening');
} catch (error) {
  logger.fatal({ err: error }, 'Core failed to start');
  process.exit(1);
}
