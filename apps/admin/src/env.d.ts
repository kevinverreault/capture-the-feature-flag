declare namespace App {
  interface Locals {
    /** The origin of the Core this admin app calls, set by the host (see host.js) or from CORE_URL. */
    coreBaseUrl: string;
    /** The admin's display name (see lib/display-name.ts), sent to Core as the actor of every change. */
    actor?: string | undefined;
    /** The host's logger (pino), for failures while rendering a page; absent under `astro dev`. */
    logger?: { error(details: object, message: string): void };
  }
}
