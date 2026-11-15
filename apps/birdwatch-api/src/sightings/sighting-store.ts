import { randomUUID } from 'node:crypto';
import type { FeedSighting } from '@ctff/birdwatch-contract';
import { Injectable } from '@nestjs/common';
import { findBirder } from '../data/birders.js';
import { findSpecies } from '../data/species.js';
import { mockSightings, type Sighting } from '../data/sightings.js';
import type { NewSighting } from './new-sighting.js';

/** The most sightings logged while the API runs that it keeps, so a busy demo doesn't grow without bound. */
const maxLoggedSightings = 500;

/** How many sightings the rare-bird alert banner shows. */
const maxRareBirdAlerts = 3;

/**
 * The sightings: the mock ones, and those logged since the API started. They are kept in memory only (the image
 * keeps no state), so a restart, or another replica, shows the mock sightings alone.
 */
@Injectable()
export class SightingStore {
  private logged: Sighting[] = [];

  /** Every sighting, the most recently observed first. */
  feed(): FeedSighting[] {
    return [...this.logged, ...mockSightings]
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
      .flatMap((sighting) => {
        const species = findSpecies(sighting.speciesId);
        const birder = findBirder(sighting.birderId);
        if (!species || !birder) return [];
        const { id, commonName, scientificName, rarity } = species;
        return [
          {
            ...sighting,
            species: { id, commonName, scientificName, rarity },
            birder: { id: birder.id, name: birder.name, country: birder.country },
          },
        ];
      });
  }

  /** The sightings of one species, the most recently observed first. */
  ofSpecies(speciesId: string): FeedSighting[] {
    return this.feed().filter((sighting) => sighting.speciesId === speciesId);
  }

  /** The latest sightings of rare species, for the rare-bird alert banner. */
  rareSightings(): FeedSighting[] {
    return this.feed()
      .filter((sighting) => sighting.species.rarity === 'rare')
      .slice(0, maxRareBirdAlerts);
  }

  log(birderId: string, sighting: NewSighting): Sighting {
    const logged: Sighting = { id: randomUUID(), birderId, ...sighting };
    this.logged = [logged, ...this.logged].slice(0, maxLoggedSightings);
    return logged;
  }
}
