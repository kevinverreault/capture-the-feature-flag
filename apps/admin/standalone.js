import { createServer } from 'node:http';
import { createAdminMiddleware } from './host.js';

/**
 * Runs the admin app on its own, against a Core elsewhere: `CORE_URL=http://core:3000 node standalone.js`.
 * Core normally mounts the admin app itself (ADR 0003); this is what running it in its own container comes to.
 */
const coreBaseUrl = process.env['CORE_URL'];
if (!coreBaseUrl) {
  console.error('CORE_URL is required: the origin of the Core the admin app calls, such as http://core:3000');
  process.exit(1);
}
const port = Number(process.env['PORT']?.trim() || '4321');
const host = process.env['HOST'] ?? '0.0.0.0';

const admin = createAdminMiddleware({ coreBaseUrl });
const server = createServer((req, res) =>
  admin(req, res, (error) => {
    console.error(error);
    res.statusCode = 500;
    res.end();
  }),
);
server.listen(port, host, () => {
  console.log(JSON.stringify({ level: 30, time: Date.now(), msg: 'Admin listening', host, port, coreBaseUrl }));
});
