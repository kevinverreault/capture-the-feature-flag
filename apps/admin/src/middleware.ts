import { defineMiddleware } from 'astro:middleware';

/** `astro dev` has no host to provide Core's address, so it comes from CORE_URL there. */
export const onRequest = defineMiddleware((context, next) => {
  context.locals.coreBaseUrl ||= process.env['CORE_URL'] ?? '';
  return next();
});
