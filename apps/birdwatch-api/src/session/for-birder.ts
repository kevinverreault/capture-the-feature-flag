import { type AllFlags, birdwatchFlags, type ForBirder } from '@ctff/birdwatch-contract';
import type { SightingStore } from '../sightings/sighting-store.js';
import { type BirderRequest, loggedInBirder } from './auth.guard.js';
import { birderContext } from './birder-context.resolver.js';

/**
 * What every route for the logged-in birder answers with: the birder, the context their flags were evaluated for,
 * their flags, and the rare-bird alerts, which only come while `rare-bird-alerts` serves `true` (with `false` as
 * the fallback value when the flags couldn't be loaded).
 */
export function forBirder(request: BirderRequest, flags: AllFlags, store: SightingStore): ForBirder {
  const alertsOn = flags.values[birdwatchFlags.rareBirdAlerts] ?? false;
  return {
    birder: loggedInBirder(request),
    context: birderContext(request.birder),
    flags,
    rareBirdAlerts: alertsOn ? store.rareSightings() : [],
  };
}
