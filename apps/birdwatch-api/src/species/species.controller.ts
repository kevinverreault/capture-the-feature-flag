import { type AllFlags, Flags } from '@ctff/nestjs';
import { Controller, Get } from '@nestjs/common';
import { type Species, species } from '../data/species.js';

@Controller('species')
export class SpeciesController {
  /** Every species, for the "log a sighting" form, with the flags of the logged-in birder. */
  @Get()
  list(@Flags() flags: AllFlags): { species: readonly Species[]; flags: AllFlags } {
    return { species, flags };
  }
}
