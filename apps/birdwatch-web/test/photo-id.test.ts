import { describe, expect, it } from 'vitest';
import { suggestSpecies } from '../src/lib/photo-id';

const species = [{ id: 'snowy-owl' }, { id: 'common-loon' }, { id: 'great-blue-heron' }];
const bytes = (text: string) => new TextEncoder().encode(text);

describe('suggestSpecies', () => {
  it('suggests the same species for the same photo', () => {
    expect(suggestSpecies(bytes('a photo'), species)).toBe(suggestSpecies(bytes('a photo'), species));
  });

  it('suggests one of the species', () => {
    const suggested = new Set(
      ['one', 'two', 'three', 'four', 'five', 'six'].map((photo) => suggestSpecies(bytes(photo), species)?.id),
    );
    expect([...suggested].every((id) => species.some((candidate) => candidate.id === id))).toBe(true);
    expect(suggested.size).toBeGreaterThan(1);
  });

  it('suggests nothing for an empty photo, or without species', () => {
    expect(suggestSpecies(new Uint8Array(), species)).toBeUndefined();
    expect(suggestSpecies(bytes('a photo'), [])).toBeUndefined();
  });
});
