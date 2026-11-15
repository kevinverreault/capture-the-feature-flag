import type { AllFlags } from '@ctff/sdk';
import {
  type CallHandler,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { RequestFlags } from './request-flags.js';

/** Where `FlagsLoader` puts, on each request, the function that loads its flags. */
const loadFlagsKey = Symbol('ctff:load-flags');

type WithFlagsLoader = Record<typeof loadFlagsKey, (() => Promise<AllFlags>) | undefined>;

/**
 * Gives every HTTP request a function that loads its flags through `RequestFlags`, bound to the request object
 * itself, for `@Flags()`: a parameter decorator can't inject providers. It loads nothing until it is called.
 * `CtffModule` registers it for the whole app.
 */
@Injectable()
export class FlagsLoader implements NestInterceptor {
  constructor(@Inject(RequestFlags) private readonly flags: RequestFlags) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest<object & WithFlagsLoader>();
      request[loadFlagsKey] = () => this.flags.forRequest(request);
    }
    return next.handle();
  }
}

/**
 * Nest awaits the promise this returns before any pipe sees it, so app-wide pipes get the loaded flags, like any
 * other parameter, and never the request.
 */
const FlagsOfRequest = createParamDecorator((_data: unknown, context: ExecutionContext): Promise<AllFlags> => {
  const load = context.switchToHttp().getRequest<Partial<WithFlagsLoader>>()[loadFlagsKey];
  if (!load) throw new Error('@Flags() needs CtffModule to be imported, and works with HTTP requests only');
  return load();
});

/**
 * Injects every flag of the environment, evaluated for the context the app's `CtffContextResolver` builds from the
 * request. The flags are loaded with one Evaluator call per request, however many `@Flags()` and `@RequireFlag`
 * the request goes through. Evaluator problems never fail the request: when the Evaluator can't be asked, there are no
 * flags and `error` says why, so look flags up with a fallback value, as in `flags.values['rare-bird-alerts'] ?? false`.
 * Only an exception from the app's resolver fails it.
 */
export const Flags = (): ParameterDecorator => FlagsOfRequest();
