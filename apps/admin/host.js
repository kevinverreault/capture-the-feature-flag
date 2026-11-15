import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import serveStatic from 'serve-static';
import { handler } from './dist/server/entry.mjs';

const clientDir = fileURLToPath(new URL('./dist/client/', import.meta.url));

/**
 * The admin app as a Connect/Express middleware: the built client assets, then the server-rendered pages. It
 * answers every request it gets, with the admin's 404 page when nothing matches, so the host mounts it after (or
 * outside of) its own routes.
 *
 * @param {import('./host.d.ts').AdminMiddlewareOptions} options
 * @returns {import('./host.d.ts').AdminMiddleware}
 */
export function createAdminMiddleware({ coreBaseUrl }) {
  const resolveCoreBaseUrl = typeof coreBaseUrl === 'function' ? coreBaseUrl : () => coreBaseUrl;
  const assets = serveStatic(clientDir, {
    index: false,
    // Astro fingerprints everything under /_astro/, so those files never change.
    setHeaders: (res, path) => {
      if (path.includes(`${sep}_astro${sep}`)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    },
  });
  return (req, res, next) => {
    assets(req, res, (error) => {
      if (error) return next(error);
      // Without `next`, Astro renders its 404 page for a path no page matches.
      return handler(req, res, undefined, { coreBaseUrl: resolveCoreBaseUrl() });
    });
  };
}
