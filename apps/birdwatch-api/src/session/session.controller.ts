import { type AllFlags, type Context, Flags } from '@ctff/nestjs';
import { Body, Controller, Get, Inject, NotFoundException, Post, Req } from '@nestjs/common';
import { type Birder, birders, findBirder } from '../data/birders.js';
import type { BirdwatchApiConfig } from '../config.js';
import { BIRDWATCH_API_CONFIG } from '../tokens.js';
import { type BirderRequest, Public } from './auth.guard.js';
import { birderContext } from './birder-context.resolver.js';
import { sessionTtlSeconds, signSession } from './session-token.js';

@Controller()
export class SessionController {
  constructor(@Inject(BIRDWATCH_API_CONFIG) private readonly config: BirdwatchApiConfig) {}

  /** The birders a visitor can log in as. */
  @Public()
  @Get('birders')
  birders(): { birders: readonly Birder[] } {
    return { birders };
  }

  /** The fake login: anyone can be any birder, and gets a session token (a JWT signed with the dev key). */
  @Public()
  @Post('session')
  async logIn(@Body() body: unknown): Promise<{ token: string; expiresInSeconds: number; birder: Birder }> {
    const birderId = typeof body === 'object' && body !== null ? (body as { birderId?: unknown }).birderId : undefined;
    const birder = typeof birderId === 'string' ? findBirder(birderId) : undefined;
    if (!birder) throw new NotFoundException('There is no such birder');
    return { token: await signSession(birder, this.config.sessionSecret), expiresInSeconds: sessionTtlSeconds, birder };
  }

  /** The logged-in birder, the context their flags are evaluated for, and those flags. */
  @Get('me')
  me(@Req() request: BirderRequest, @Flags() flags: AllFlags): { birder: Birder; context: Context; flags: AllFlags } {
    const birder = findBirder(request.birder?.sub ?? '');
    if (!birder) throw new NotFoundException('There is no such birder');
    return { birder, context: birderContext(request.birder), flags };
  }
}
