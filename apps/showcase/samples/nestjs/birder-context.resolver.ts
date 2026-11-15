import type { Context, CtffContextResolver } from '@ctff/nestjs';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

// Builds the context to evaluate flags for from a request; here, from the birder an auth guard put on it.
@Injectable()
export class BirderContextResolver implements CtffContextResolver<Request> {
  resolve(request: Request): Context {
    const birder = (request as Request & { user?: { sub: string; country: string } }).user;
    return birder ? { user_id: birder.sub, country: birder.country } : {};
  }
}
