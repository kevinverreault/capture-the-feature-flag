import { describe, expect, it } from 'vitest';
import { checkNewSighting } from '../src/sightings/new-sighting.js';

const now = new Date('2026-11-15T12:00:00Z');

describe('checking a new sighting', () => {
  it('accepts a known species, a location and a count, observed now by default', () => {
    expect(checkNewSighting({ speciesId: 'snowy-owl', location: ' Tommy Thompson Park ', count: 2 }, now)).toEqual({
      valid: true,
      sighting: {
        speciesId: 'snowy-owl',
        location: 'Tommy Thompson Park',
        count: 2,
        notes: '',
        observedAt: '2026-11-15T12:00:00.000Z',
      },
    });
  });

  it('takes form values as strings, and an earlier observation time', () => {
    const checked = checkNewSighting(
      {
        speciesId: 'bluethroat',
        location: 'Lauwersmeer',
        count: '3',
        notes: ' Singing male ',
        observedAt: '2026-11-14T07:30',
      },
      now,
    );
    expect(checked).toMatchObject({ valid: true, sighting: { count: 3, notes: 'Singing male' } });
    expect(checked.valid && new Date(checked.sighting.observedAt).getTime()).toBeLessThan(now.getTime());
  });

  it('names every field that is wrong', () => {
    expect(checkNewSighting({ speciesId: 'dodo', location: ' ', count: 0, notes: 'x'.repeat(501) }, now)).toEqual({
      valid: false,
      errors: {
        speciesId: 'Choose a species from the list',
        location: 'Say where you saw it',
        count: 'Count at least one bird, and at most 10,000',
        notes: 'Keep notes to 500 characters',
      },
    });
  });

  it('refuses counts that are not whole numbers, and observations in the future', () => {
    expect(checkNewSighting({ speciesId: 'snowy-owl', location: 'Here', count: '1.5' }, now)).toMatchObject({
      valid: false,
      errors: { count: expect.any(String) },
    });
    expect(
      checkNewSighting({ speciesId: 'snowy-owl', location: 'Here', count: 1, observedAt: '2026-11-16T12:00:00Z' }, now),
    ).toMatchObject({ valid: false, errors: { observedAt: 'An observation can’t be in the future' } });
    expect(
      checkNewSighting({ speciesId: 'snowy-owl', location: 'Here', count: 1, observedAt: 'yesterday' }, now),
    ).toMatchObject({ valid: false, errors: { observedAt: 'Give a date and time' } });
  });

  it('refuses a body that is not an object', () => {
    expect(checkNewSighting(null, now)).toMatchObject({ valid: false });
    expect(checkNewSighting('snowy-owl', now)).toMatchObject({ valid: false });
  });
});
