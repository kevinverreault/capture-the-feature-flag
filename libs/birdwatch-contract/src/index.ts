import type { AllFlags } from '@ctff/sdk';

export type { AllFlags, Context } from '@ctff/sdk';

/** The flags of the Birdwatch demo, which Core's demo seed creates in the `birdwatch` project. */
export const birdwatchFlags = {
  /** Kill switch for "Log a sighting": the form, and the endpoint behind it. */
  newSightingForm: 'new-sighting-form',
  rareBirdAlerts: 'rare-bird-alerts',
  photoIdBeta: 'photo-id-beta',
} as const;

/** What a new sighting may hold: birdwatch-api checks it, and the website's form says so up front. */
export const sightingLimits = {
  maxLocationLength: 120,
  maxNotesLength: 500,
  maxCount: 10_000,
} as const;

/** A birder of the demo. Logging in as one makes their `id` the context's `user_id`, and their `country` its country. */
export interface Birder {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Where they usually go birding, for the login screen. */
  homePatch: string;
}

export type Rarity = 'common' | 'uncommon' | 'rare';

export interface Species {
  id: string;
  commonName: string;
  scientificName: string;
  family: string;
  rarity: Rarity;
  description: string;
}

/** A sighting as kept: who saw how many of what, where and when. */
export interface Sighting {
  id: string;
  speciesId: string;
  birderId: string;
  location: string;
  count: number;
  notes: string;
  observedAt: string;
}

/** A sighting in the feed, with its species and birder. */
export interface FeedSighting extends Sighting {
  species: Pick<Species, 'id' | 'commonName' | 'scientificName' | 'rarity'>;
  birder: Pick<Birder, 'id' | 'name' | 'country'>;
}

/** `GET /api/birders`. */
export interface BirdersResponse {
  birders: readonly Birder[];
}

/** `POST /api/session`: the fake login. */
export interface SessionResponse {
  token: string;
  expiresInSeconds: number;
  birder: Birder;
}

/** What every route for the logged-in birder answers with: the birder, and their flags (loaded once). */
export interface ForBirder {
  birder: Birder;
  flags: AllFlags;
}

/** `GET /api/sightings`. */
export interface FeedResponse extends ForBirder {
  sightings: FeedSighting[];
}

/** `GET /api/species`. */
export interface SpeciesResponse extends ForBirder {
  species: readonly Species[];
}

/** `POST /api/sightings`. */
export interface LoggedSightingResponse {
  sighting: Sighting;
}
