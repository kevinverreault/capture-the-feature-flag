import type { AllFlags, SpeciesResponse } from '@ctff/birdwatch-contract';
import { Flags } from '@ctff/nestjs';
import { Controller, Get, Req } from '@nestjs/common';
import { species } from '../data/species.js';
import { type BirderRequest, loggedInBirder } from '../session/auth.guard.js';

@Controller('species')
export class SpeciesController {
  /** Every species, for the "log a sighting" form, with the logged-in birder and their flags. */
  @Get()
  list(@Req() request: BirderRequest, @Flags() flags: AllFlags): SpeciesResponse {
    return { birder: loggedInBirder(request), flags, species };
  }
}
