import { createAdminMiddleware } from '@ctff/admin';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import type { CoreConfig } from './config.js';

/** Path prefixes Core answers itself; the admin app gets every other path. */
const corePrefixes = ['/api', '/health'];

/** Whether Core's own routes (the API, its docs and the health checks) own this path. */
export function isCoreRoute(path: string): boolean {
  // Express matches routes case-insensitively, so /API/v1/projects is an API route too.
  const lower = path.toLowerCase();
  return corePrefixes.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`));
}

/** The URL a process reaches its own server on: loopback when the server listens on every interface. */
export function loopbackUrl(host: string, port: number): string {
  if (host === '0.0.0.0' || host === '') return `http://127.0.0.1:${port}`;
  if (host === '::') return `http://[::1]:${port}`;
  return `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
}

/**
 * Mounts the admin app (ADR 0003), unless ADMIN_ENABLED is false, on every path Core's routes don't own. It is registered ahead of Nest's
 * router and body parsers, so the forms it receives reach it unread. The admin app calls Core's API over HTTP:
 * by default this Core's own, through loopback, or the one ADMIN_CORE_URL names.
 */
export function mountAdmin(app: NestExpressApplication, config: CoreConfig): void {
  if (!config.adminEnabled) return;
  const admin = createAdminMiddleware({
    coreBaseUrl: () => config.adminCoreUrl ?? loopbackUrl(config.host, listeningPort(app)),
  });
  app.use((req: Request, res: Response, next: NextFunction) =>
    isCoreRoute(req.path) ? next() : admin(req, res, next),
  );
}

function listeningPort(app: NestExpressApplication): number {
  const address = app.getHttpServer().address();
  if (typeof address !== 'object' || address === null) throw new Error('Core is not listening on a TCP port');
  return address.port;
}
