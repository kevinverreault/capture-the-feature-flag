import type { BirdersResponse, SessionResponse } from '@ctff/birdwatch-contract';
import { Body, Controller, Get, Inject, NotFoundException, Post } from '@nestjs/common';
import { birders, findBirder } from '../data/birders.js';
import type { BirdwatchApiConfig } from '../config.js';
import { BIRDWATCH_API_CONFIG } from '../tokens.js';
import { Public } from './auth.guard.js';
import { sessionTtlSeconds, signSession } from './session-token.js';

@Public()
@Controller()
export class SessionController {
  constructor(@Inject(BIRDWATCH_API_CONFIG) private readonly config: BirdwatchApiConfig) {}

  /** The birders a visitor can log in as. */
  @Get('birders')
  birders(): BirdersResponse {
    return { birders };
  }

  /** The fake login: anyone can be any birder, and gets a session token (a JWT signed with the dev key). */
  @Post('session')
  async logIn(@Body() body: unknown): Promise<SessionResponse> {
    const birderId = typeof body === 'object' && body !== null ? (body as { birderId?: unknown }).birderId : undefined;
    const birder = typeof birderId === 'string' ? findBirder(birderId) : undefined;
    if (!birder) throw new NotFoundException('There is no such birder');
    return { token: await signSession(birder, this.config.sessionSecret), expiresInSeconds: sessionTtlSeconds, birder };
  }
}
