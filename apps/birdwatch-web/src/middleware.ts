import { defineMiddleware } from 'astro:middleware';
import { adminAppFromEnv } from './lib/inspector';

/** Read once: the environment doesn't change while the site runs. */
const adminApp = adminAppFromEnv(process.env);

/**
 * Runs around every page:
 * - `astro dev` has no server.js to say where birdwatch-api is, so it comes from BIRDWATCH_API_URL there.
 * - The flag inspector's admin app comes from CTFF_ADMIN_URL, CTFF_PROJECT and CTFF_ENVIRONMENT.
 * - A page that fails (birdwatch-api unreachable or answering 5xx) is logged and answered with the 500 page.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.apiUrl ||= process.env['BIRDWATCH_API_URL']?.trim().replace(/\/+$/, '') ?? '';
  context.locals.admin = adminApp;
  try {
    return await next();
  } catch (error) {
    const details = { err: error, method: context.request.method, url: context.url.pathname };
    if (context.locals.logger) context.locals.logger.error(details, 'Birdwatch page failed');
    else console.error(details);
    return context.rewrite('/500');
  }
});
