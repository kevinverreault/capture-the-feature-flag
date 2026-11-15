import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';

export interface AdminMiddlewareOptions {
  /**
   * The origin of the Core the admin app calls through the core-api-client, such as `http://core:3000`. A function
   * is called on every request, for a host that only knows its address once it listens.
   */
  coreBaseUrl: string | (() => string);
  /** Logs each request and every page that fails, as JSON. */
  logger?: Logger;
}

export type AdminMiddleware = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;

export function createAdminMiddleware(options: AdminMiddlewareOptions): AdminMiddleware;
