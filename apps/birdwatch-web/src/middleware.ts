import { defineMiddleware } from 'astro:middleware';

/**
 * Runs around every page:
 * - `astro dev` has no server.js to say where birdwatch-api and the admin app are, so they come from
 *   BIRDWATCH_API_URL, CTFF_ADMIN_URL, CTFF_PROJECT and CTFF_ENVIRONMENT there.
 * - A page that fails (birdwatch-api unreachable or answering 5xx) is logged and answered with the 500 page.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.apiUrl ||= process.env['BIRDWATCH_API_URL']?.trim().replace(/\/+$/, '') ?? '';
  context.locals.admin ??= {
    url: process.env['CTFF_ADMIN_URL']?.trim().replace(/\/+$/, '') ?? '',
    projectKey: process.env['CTFF_PROJECT']?.trim() || 'birdwatch',
    environmentKey: process.env['CTFF_ENVIRONMENT']?.trim() || 'development',
  };
  try {
    return await next();
  } catch (error) {
    const details = { err: error, method: context.request.method, url: context.url.pathname };
    if (context.locals.logger) context.locals.logger.error(details, 'Birdwatch page failed');
    else console.error(details);
    return context.rewrite('/500');
  }
});
