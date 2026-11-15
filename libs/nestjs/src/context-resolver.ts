import type { Context } from '@ctff/sdk';

/**
 * Builds the context to evaluate flags for from a request, for `@Flags()` and `@RequireFlag`. The app implements
 * it, typically from its own authentication (such as the `user_id` and `country` claims of a JWT), and names the
 * class in `CtffModule.forRoot()`; it is an ordinary provider, so it can inject what it needs. An exception it
 * throws fails the request like one thrown by any guard.
 */
export interface CtffContextResolver<Request = unknown> {
  resolve(request: Request): Context | Promise<Context>;
}

/** The injection token of the app's context resolver. */
export const CTFF_CONTEXT_RESOLVER = Symbol('CTFF_CONTEXT_RESOLVER');
