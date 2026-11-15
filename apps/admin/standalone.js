import { createServer } from 'node:http';
import { pino } from 'pino';
import { createAdminMiddleware } from './host.js';

/**
 * Runs the admin app on its own, against a Core elsewhere: `CORE_URL=http://core:3000 node standalone.js`.
 * Core normally mounts the admin app itself (ADR 0003); this is what running it in its own container comes to
 * (with ADMIN_ENABLED=false on Core). Logs are JSON lines on stdout, as Core's are.
 */
const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const coreBaseUrl = process.env['CORE_URL'];
if (!coreBaseUrl) fail('CORE_URL is required: the origin of the Core the admin app calls, such as http://core:3000');
// An empty PORT (e.g. `PORT=` in an env file) means unset, not port 0.
const rawPort = process.env['PORT']?.trim() || '4321';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`PORT is not a valid port: ${rawPort}`);
const host = process.env['HOST'] ?? '0.0.0.0';

const admin = createAdminMiddleware({ coreBaseUrl, logger });
const server = createServer((req, res) =>
  admin(req, res, (error) => {
    logger.error({ err: error, url: req.url }, 'Admin request failed');
    res.statusCode = 500;
    res.end();
  }),
);
server.listen(port, host, () => logger.info({ host, port, coreBaseUrl }, 'Admin listening'));

/** @param {string} message */
function fail(message) {
  logger.fatal(message);
  process.exit(1);
}
