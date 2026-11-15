import { defineMiddleware } from 'astro:middleware';
import { isUnverifiablePost } from './lib/site-check';

/**
 * Runs around every page:
 * - `astro dev` has no host to provide Core's address, so it comes from CORE_URL there.
 * - A post that says nothing about where it comes from is refused (see isUnverifiablePost).
 * - A page that fails (Core unreachable or answering 5xx) is logged through the host's logger and answered with
 *   the 500 page, instead of Astro's plain-text log line and an empty response.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.coreBaseUrl ||= process.env['CORE_URL'] ?? '';
  if (isUnverifiablePost(context.request)) {
    return new Response('Form posts must come from the admin app’s own pages', { status: 403 });
  }
  try {
    return await next();
  } catch (error) {
    const details = { err: error, method: context.request.method, url: context.url.pathname };
    if (context.locals.logger) context.locals.logger.error(details, 'Admin page failed');
    else console.error(details);
    return context.rewrite('/500');
  }
});
