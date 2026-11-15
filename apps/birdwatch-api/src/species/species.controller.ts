import type { AllFlags, SpeciesPageResponse, SpeciesResponse } from '@ctff/birdwatch-contract';
import { Flags } from '@ctff/nestjs';
import { Controller, Get, NotFoundException, Param, Req } from '@nestjs/common';
import { findSpecies, species } from '../data/species.js';
import type { BirderRequest } from '../session/auth.guard.js';
import { forBirder } from '../session/for-birder.js';
import { SightingStore } from '../sightings/sighting-store.js';

@Controller('species')
export class SpeciesController {
  constructor(private readonly store: SightingStore) {}

  /** Every species, for the species pages and the "log a sighting" form, with the logged-in birder and their flags. */
  @Get()
  list(@Req() request: BirderRequest, @Flags() flags: AllFlags): SpeciesResponse {
    return { ...forBirder(request, flags, this.store), species };
  }

  /** One species and its sightings, with the logged-in birder and their flags, or `404` for an unknown species. */
  @Get(':speciesId')
  page(
    @Req() request: BirderRequest,
    @Param('speciesId') speciesId: string,
    @Flags() flags: AllFlags,
  ): SpeciesPageResponse {
    const found = findSpecies(speciesId);
    if (!found) throw new NotFoundException('There is no such species');
    return { ...forBirder(request, flags, this.store), species: found, sightings: this.store.ofSpecies(found.id) };
  }
}
