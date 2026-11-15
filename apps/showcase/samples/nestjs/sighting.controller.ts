import { type AllFlags, CtffClient, Flags, RequireFlag } from '@ctff/nestjs';
import { Controller, Get, Post, Query } from '@nestjs/common';

@Controller('sightings')
export class SightingController {
  constructor(private readonly ctff: CtffClient) {}

  // One flag, for a context built by hand, with `false` as the fallback value.
  @Get('alerts')
  async alerts(@Query('country') country: string) {
    return { alerts: await this.ctff.variation('rare-bird-alerts', { country }, false) };
  }

  // Every flag, loaded once per request for the context the resolver builds.
  @Get()
  feed(@Flags() flags: AllFlags) {
    return { sightings: [], rareBirdAlerts: flags.values['rare-bird-alerts'] ?? false };
  }

  // 404 Not Found unless the flag serves `true`: a kill switch for the endpoint.
  @Post()
  @RequireFlag('new-sighting-form')
  create() {
    return { logged: true };
  }
}
