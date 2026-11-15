import { type AllFlags, Flags, RequireFlag } from '@ctff/nestjs';
import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Sighting } from '../data/sightings.js';
import type { BirderRequest } from '../session/auth.guard.js';
import { checkNewSighting } from './new-sighting.js';
import { type FeedSighting, SightingStore } from './sighting-store.js';

@Controller('sightings')
export class SightingsController {
  constructor(private readonly store: SightingStore) {}

  /** The sighting feed, with the flags of the logged-in birder. */
  @Get()
  feed(@Flags() flags: AllFlags): { sightings: FeedSighting[]; flags: AllFlags } {
    return { sightings: this.store.feed(), flags };
  }

  /**
   * Logs a sighting. Behind the `new-sighting-form` kill switch: while it serves `false`, this answers `404`, as
   * if the endpoint didn't exist. A body that doesn't check out gets `400`, with a message per field in `fields`.
   */
  @Post()
  @RequireFlag('new-sighting-form')
  log(@Req() request: BirderRequest, @Body() body: unknown): { sighting: Sighting } {
    const checked = checkNewSighting(body);
    if (!checked.valid) {
      throw new BadRequestException({ statusCode: 400, message: 'The sighting is not valid', fields: checked.errors });
    }
    // The AuthGuard has set the birder: this route isn't public.
    return { sighting: this.store.log(request.birder?.sub ?? '', checked.sighting) };
  }
}
