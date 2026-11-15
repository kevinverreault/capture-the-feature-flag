import type { Context, CtffContextResolver } from '@ctff/nestjs';
import { Injectable } from '@nestjs/common';
import type { BirderRequest } from './auth.guard.js';
import type { SessionClaims } from './session-token.js';

/**
 * The context flags are evaluated for: the logged-in birder's user ID and country, read from their session token
 * by the AuthGuard. A request without a birder (a public route) has an empty context.
 */
@Injectable()
export class BirderContextResolver implements CtffContextResolver<BirderRequest> {
  resolve(request: BirderRequest): Context {
    return birderContext(request.birder);
  }
}

/** The context of a logged-in birder: their user ID (the token's `sub`) and country. No birder, no attributes. */
export function birderContext(birder: SessionClaims | undefined): Context {
  return birder ? { user_id: birder.sub, country: birder.country } : {};
}
