import { sightingLimits } from '@ctff/birdwatch-contract';
import { findSpecies } from '../data/species.js';

/** A sighting a birder logs, as checked: trimmed, with its count as a number and its time in ISO 8601. */
export interface NewSighting {
  speciesId: string;
  location: string;
  count: number;
  notes: string;
  observedAt: string;
}

export type NewSightingField = keyof NewSighting;

export type CheckedSighting =
  { valid: true; sighting: NewSighting } | { valid: false; errors: Partial<Record<NewSightingField, string>> };

const { maxLocationLength, maxNotesLength, maxCount } = sightingLimits;
/** How far ahead of the server's clock an observation may be, for clocks that disagree a little. */
const clockSkewMs = 5 * 60_000;

/**
 * Checks the body of "log a sighting", from JSON or from a form (where every value is a string), and says what is
 * wrong with each field, in words for the birder. An observation without a time is observed `now`.
 */
export function checkNewSighting(body: unknown, now = new Date()): CheckedSighting {
  const input = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const errors: Partial<Record<NewSightingField, string>> = {};

  const speciesId = text(input['speciesId']);
  if (!findSpecies(speciesId)) errors.speciesId = 'Choose a species from the list';

  const location = text(input['location']);
  if (location === '') errors.location = 'Say where you saw it';
  else if (location.length > maxLocationLength)
    errors.location = `Keep the location to ${maxLocationLength} characters`;

  const count =
    typeof input['count'] === 'string' && input['count'].trim() !== '' ? Number(input['count']) : input['count'];
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > maxCount) {
    errors.count = `Count at least one bird, and at most ${maxCount.toLocaleString('en')}`;
  }

  const notes = text(input['notes']);
  if (notes.length > maxNotesLength) errors.notes = `Keep notes to ${maxNotesLength} characters`;

  const rawObservedAt = text(input['observedAt']);
  const observedAt = rawObservedAt === '' ? now : new Date(rawObservedAt);
  if (Number.isNaN(observedAt.getTime())) errors.observedAt = 'Give a date and time';
  else if (observedAt.getTime() > now.getTime() + clockSkewMs)
    errors.observedAt = 'An observation can’t be in the future';

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    sighting: { speciesId, location, count: count as number, notes, observedAt: observedAt.toISOString() },
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
