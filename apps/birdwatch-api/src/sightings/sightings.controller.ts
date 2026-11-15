import {
  type AllFlags,
  birdwatchFlags,
  type FeedResponse,
  type LoggedSightingResponse,
} from '@ctff/birdwatch-contract';
import { Flags, RequireFlag } from '@ctff/nestjs';
import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { type BirderRequest, loggedInBirder } from '../session/auth.guard.js';
import { forBirder } from '../session/for-birder.js';
import { checkNewSighting } from './new-sighting.js';
import { SightingStore } from './sighting-store.js';

@Controller('sightings')
export class SightingsController {
  constructor(private readonly store: SightingStore) {}

  /** The sighting feed, with the logged-in birder and their flags. */
  @Get()
  feed(@Req() request: BirderRequest, @Flags() flags: AllFlags): FeedResponse {
    return { ...forBirder(request, flags, this.store), sightings: this.store.feed() };
  }

  /**
   * Logs a sighting. Behind the `new-sighting-form` kill switch: while it serves `false`, this answers `404`, as
   * if the endpoint didn't exist. A body that doesn't check out gets `400`, with a message per field in `fields`.
   */
  @Post()
  @RequireFlag(birdwatchFlags.newSightingForm)
  log(@Req() request: BirderRequest, @Body() body: unknown): LoggedSightingResponse {
    const checked = checkNewSighting(body);
    if (!checked.valid) {
      throw new BadRequestException({ statusCode: 400, message: 'The sighting is not valid', fields: checked.errors });
    }
    return { sighting: this.store.log(loggedInBirder(request).id, checked.sighting) };
  }
}
