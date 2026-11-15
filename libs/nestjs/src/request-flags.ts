import type { AllFlags } from '@ctff/sdk';
import { Inject, Injectable } from '@nestjs/common';
import { CTFF_CONTEXT_RESOLVER, type CtffContextResolver } from './context-resolver.js';
import { CtffClient } from './ctff-client.js';

/**
 * The flags of each request, loaded with one `allFlags` call the first time `@Flags()` or `@RequireFlag` asks for
 * them, and kept for the rest of that request only: the cache is keyed by the request object, so it goes with it.
 */
@Injectable()
export class RequestFlags {
  private readonly loaded = new WeakMap<object, Promise<AllFlags>>();

  constructor(
    @Inject(CtffClient) private readonly client: CtffClient,
    @Inject(CTFF_CONTEXT_RESOLVER) private readonly resolver: CtffContextResolver,
  ) {}

  forRequest(request: object): Promise<AllFlags> {
    let flags = this.loaded.get(request);
    if (!flags) {
      flags = this.load(request);
      this.loaded.set(request, flags);
    }
    return flags;
  }

  private async load(request: object): Promise<AllFlags> {
    return this.client.allFlags(await this.resolver.resolve(request));
  }
}
