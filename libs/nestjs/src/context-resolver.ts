import type { Context } from '@ctff/sdk';

/**
 * Builds the context to evaluate flags for from a request, for `@Flags()` and `@RequireFlag`. The app implements
 * it, typically from its own authentication (such as the `user_id` and `country` claims of a JWT), and names the
 * class in `CtffModule.forRoot()`. It is a provider of `CtffModule`, so it can inject global providers and those
 * exported by the modules passed in `imports`. An exception it throws fails the request like one thrown by a guard.
 *
 * It runs once per request, the first time `@RequireFlag` or `@Flags()` needs the flags, and that context is kept
 * for the rest of the request. So whatever it reads (such as `request.user`) must be set before then: by middleware,
 * a global guard, or a route guard written below `@RequireFlag`. HTTP requests only.
 */
export interface CtffContextResolver<Request = unknown> {
  resolve(request: Request): Context | Promise<Context>;
}

/** The injection token of the app's context resolver. */
export const CTFF_CONTEXT_RESOLVER = Symbol('CTFF_CONTEXT_RESOLVER');
