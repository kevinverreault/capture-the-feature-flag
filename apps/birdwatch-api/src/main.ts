import { pino } from 'pino';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { resolveSdkKey } from './sdk-key.js';

const config = loadConfig();
// Session tokens are fake, but they are still bearer tokens: keep them out of the logs.
const logger = pino({ level: config.logLevel, redact: ['req.headers.authorization'] });

try {
  const sdkKey = await resolveSdkKey(config.sdkKey, logger);
  const app = await createApp(config, sdkKey, logger);
  await app.listen(config.port, config.host);
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address !== null ? address.port : config.port;
  logger.info({ host: config.host, port, evaluatorUrl: config.evaluatorUrl }, 'birdwatch-api listening');
} catch (error) {
  logger.fatal({ err: error }, 'birdwatch-api failed to start');
  process.exit(1);
}
