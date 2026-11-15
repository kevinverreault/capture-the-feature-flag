declare namespace App {
  interface Locals {
    /** The origin of the Core this admin app calls, set by the host (see host.js) or from CORE_URL. */
    coreBaseUrl: string;
    /** The host's logger (pino), for failures while rendering a page; absent under `astro dev`. */
    logger?: { error(details: object, message: string): void };
  }
}
