import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  type Type,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestFlags } from './request-flags.js';

const requiredFlagsKey = 'ctff:required-flags';

/** Answers `404` unless every flag `@RequireFlag` names on the handler and its controller serves `true`. */
@Injectable()
export class RequireFlagGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RequestFlags) private readonly flags: RequestFlags,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndMerge<string[]>(requiredFlagsKey, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required.length === 0) return true;
    const flags = await this.flags.of(context.switchToHttp().getRequest());
    for (const flagKey of required) if (flags.values[flagKey] !== true) throw new NotFoundException();
    return true;
  }
}

/**
 * Hides a route, or every route of a controller, behind a flag: the request gets `404` unless the flag serves
 * `true` to the context the app's `CtffContextResolver` builds. A flag that serves no variation (unknown, archived,
 * or the Evaluator unreachable) counts as `false`. It shares its one Evaluator call per request with `@Flags()`.
 * It can be applied several times, and then every flag must serve `true`. Decorators apply from the bottom up, so
 * the guard written closest to the route runs first: write `@RequireFlag` above the guards the resolver depends on,
 * as in `@RequireFlag('photo-id-beta') @UseGuards(AuthGuard)`, so they run before it.
 */
export function RequireFlag(flagKey: string): ClassDecorator & MethodDecorator {
  return (target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    const holder: object = descriptor ? (descriptor.value as object) : target;
    const required = (Reflect.getMetadata(requiredFlagsKey, holder) as string[] | undefined) ?? [];
    Reflect.defineMetadata(requiredFlagsKey, [...required, flagKey], holder);
    // One guard checks them all.
    if (required.length > 0) return;
    const guard = UseGuards(RequireFlagGuard);
    if (propertyKey !== undefined && descriptor) guard(target, propertyKey, descriptor);
    else guard(target as Type);
  };
}
