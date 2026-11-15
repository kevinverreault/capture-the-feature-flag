import { defineMiddleware } from 'astro:middleware';

/**
 * Runs around every page:
 * - `astro dev` has no server.js to say where birdwatch-api is, so it comes from BIRDWATCH_API_URL there.
 * - A page that fails (birdwatch-api unreachable or answering 5xx) is logged and answered with the 500 page.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.apiUrl ||= process.env['BIRDWATCH_API_URL']?.replace(/\/+$/, '') ?? '';
  try {
    return await next();
  } catch (error) {
    const details = { err: error, method: context.request.method, url: context.url.pathname };
    if (context.locals.logger) context.locals.logger.error(details, 'Birdwatch page failed');
    else console.error(details);
    return context.rewrite('/500');
  }
});
