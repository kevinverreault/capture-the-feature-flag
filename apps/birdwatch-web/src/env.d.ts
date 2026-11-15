declare namespace App {
  interface Locals {
    /** The origin of birdwatch-api, set by server.js (or from BIRDWATCH_API_URL under `astro dev`). */
    apiUrl: string;
    /** server.js's logger (pino), for pages that fail; absent under `astro dev`. */
    logger?: { error(details: object, message: string): void };
  }
}
