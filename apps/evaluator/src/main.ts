import { sdkKeyHeader } from '@ctff/evaluation';
import { pino } from 'pino';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
// SDK keys identify environments and will become credentials, so they never reach the logs.
const logger = pino({ level: config.logLevel, redact: [`req.headers["${sdkKeyHeader}"]`] });

try {
  const app = await createApp(config, logger);
  await app.listen(config.port, config.host);
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address !== null ? address.port : config.port;
  logger.info(
    { host: config.host, port, coreUrl: config.coreUrl, pollIntervalMs: config.pollIntervalMs },
    'Evaluator listening',
  );
} catch (error) {
  logger.fatal({ err: error }, 'Evaluator failed to start');
  process.exit(1);
}
