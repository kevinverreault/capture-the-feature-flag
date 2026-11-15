declare namespace App {
  interface Locals {
    /** The origin of birdwatch-api, set by server.js (or from BIRDWATCH_API_URL under `astro dev`). */
    apiUrl: string;
    /** Where the flag inspector links to, from the CTFF_* variables (set by the middleware). */
    admin: import('./lib/inspector').AdminApp;
    /** server.js's logger (pino), for pages that fail; absent under `astro dev`. */
    logger?: { error(details: object, message: string): void };
  }
}
