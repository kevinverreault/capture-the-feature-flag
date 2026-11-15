import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { BIRDWATCH_API_CONFIG } from '../tokens.js';
import type { BirdwatchApiConfig } from '../config.js';
import { type SessionClaims, verifySession } from './session-token.js';

const publicKey = 'birdwatch:public';

/** Lets a route through without a session, such as the birder list and the login itself. */
export const Public = (): ClassDecorator & MethodDecorator => SetMetadata(publicKey, true);

/** A request whose session token checked out: the birder it was signed for. */
export interface BirderRequest extends Request {
  birder?: SessionClaims;
}

/**
 * Registered for the whole app, so it runs before every route guard, `@RequireFlag` included: the context resolver
 * finds `request.birder` set. Every route needs a valid `Authorization: Bearer <session token>` unless `@Public()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(BIRDWATCH_API_CONFIG) private readonly config: BirdwatchApiConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(publicKey, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<BirderRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    const birder = scheme === 'Bearer' && token ? await verifySession(token, this.config.sessionSecret) : null;
    if (!birder) throw new UnauthorizedException('Log in as a birder first');
    request.birder = birder;
    return true;
  }
}
