import type { AllFlags } from '@ctff/sdk';
import { createParamDecorator, type ExecutionContext, Inject, Injectable, type PipeTransform } from '@nestjs/common';
import { RequestFlags } from './request-flags.js';

/** Hands the request to `FlagsPipe`, which can inject what loading the flags takes, unlike a parameter decorator. */
const CurrentRequest = createParamDecorator((_data: unknown, context: ExecutionContext): object =>
  context.switchToHttp().getRequest(),
);

@Injectable()
export class FlagsPipe implements PipeTransform<object, Promise<AllFlags>> {
  constructor(@Inject(RequestFlags) private readonly flags: RequestFlags) {}

  transform(request: object): Promise<AllFlags> {
    return this.flags.of(request);
  }
}

/**
 * Injects every flag of the environment, evaluated for the context the app's `CtffContextResolver` builds from the
 * request. The flags are loaded with one Evaluator call per request, however many `@Flags()` and `@RequireFlag`
 * the request goes through. Evaluator problems never fail the request: when the Evaluator can't be asked, there are no
 * flags and `error` says why, so look flags up with a fallback value, as in `flags.values['rare-bird-alerts'] ?? false`.
 * Only an exception from the app's resolver fails it.
 */
export const Flags = (): ParameterDecorator => CurrentRequest(FlagsPipe);
