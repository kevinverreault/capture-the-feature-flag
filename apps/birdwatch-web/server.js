import { createServer } from 'node:http';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import serveStatic from 'serve-static';
import { handler } from './dist/server/entry.mjs';

/**
 * Serves Birdwatch: the built client assets, then the server-rendered pages. All configuration comes from
 * environment variables: BIRDWATCH_API_URL (required), CTFF_ADMIN_URL, CTFF_PROJECT, CTFF_ENVIRONMENT, PORT, HOST
 * and LOG_LEVEL. Logs are JSON lines on stdout.
 */
const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info', redact: ['req.headers.cookie'] });

const apiUrl = process.env['BIRDWATCH_API_URL']?.trim().replace(/\/+$/, '');
if (!apiUrl) fail('BIRDWATCH_API_URL is required: the origin of birdwatch-api, such as http://birdwatch-api:3000');
// An empty PORT (e.g. `PORT=` in an env file) means unset, not port 0.
const rawPort = process.env['PORT']?.trim() || '3000';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`PORT is not a valid port: ${rawPort}`);
const host = process.env['HOST'] ?? '0.0.0.0';
// Where the flag inspector links to: the admin app as a browser reaches it, in Birdwatch's project and environment.
const adminUrl = process.env['CTFF_ADMIN_URL']?.trim().replace(/\/+$/, '') ?? '';
if (adminUrl && !URL.canParse(adminUrl)) fail(`CTFF_ADMIN_URL is not a URL: ${adminUrl}`);
const admin = {
  url: adminUrl,
  projectKey: process.env['CTFF_PROJECT']?.trim() || 'birdwatch',
  environmentKey: process.env['CTFF_ENVIRONMENT']?.trim() || 'development',
};

const clientDir = fileURLToPath(new URL('./dist/client/', import.meta.url));
const logRequest = pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith('/health/') ?? false } });
const assets = serveStatic(clientDir, {
  index: false,
  // Astro fingerprints everything under /_astro/, so those files never change.
  setHeaders: (res, path) => {
    if (path.includes(`${sep}_astro${sep}`)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
  },
});

const server = createServer((req, res) =>
  logRequest(req, res, () =>
    assets(req, res, (error) => {
      if (error) {
        logger.error({ err: error, url: req.url }, 'Request failed');
        res.statusCode = 500;
        return res.end();
      }
      // Without `next`, Astro renders its 404 page for a path no page matches.
      return handler(req, res, undefined, { apiUrl, admin, logger });
    }),
  ),
);
server.listen(port, host, () => {
  const address = server.address();
  logger.info(
    { host, port: typeof address === 'object' && address ? address.port : port, apiUrl, adminUrl },
    'birdwatch-web listening',
  );
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));

/** @param {string} message */
function fail(message) {
  logger.fatal(message);
  process.exit(1);
}
