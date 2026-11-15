import { describe, expect, it } from 'vitest';
import { filterFlags, listedTags } from '../src/lib/flag-list.js';

const flags = [
  { key: 'new-sighting-form', name: 'New sighting form', tags: ['birdwatch', 'kill-switch'] },
  { key: 'rare-bird-alerts', name: 'Rare bird alerts', tags: ['birdwatch', 'alerts'] },
  { key: 'photo-id-beta', name: 'Photo ID (beta)', tags: [] },
];
const keys = (list: readonly { key: string }[]) => list.map((flag) => flag.key);

describe('filterFlags', () => {
  it('keeps every flag without a search or tag', () => {
    expect(keys(filterFlags(flags, {}))).toEqual(['new-sighting-form', 'rare-bird-alerts', 'photo-id-beta']);
    expect(keys(filterFlags(flags, { search: '  ', tag: '' }))).toHaveLength(3);
  });

  it('searches the key and the name, ignoring case and surrounding spaces', () => {
    expect(keys(filterFlags(flags, { search: 'BIRD' }))).toEqual(['rare-bird-alerts']);
    expect(keys(filterFlags(flags, { search: ' photo-id ' }))).toEqual(['photo-id-beta']);
    expect(keys(filterFlags(flags, { search: 'id (beta' }))).toEqual(['photo-id-beta']);
    expect(keys(filterFlags(flags, { search: 'sighting' }))).toEqual(['new-sighting-form']);
    expect(filterFlags(flags, { search: 'owl' })).toEqual([]);
  });

  it('keeps the flags carrying the tag', () => {
    expect(keys(filterFlags(flags, { tag: 'birdwatch' }))).toEqual(['new-sighting-form', 'rare-bird-alerts']);
    expect(keys(filterFlags(flags, { tag: 'alerts' }))).toEqual(['rare-bird-alerts']);
    expect(filterFlags(flags, { tag: 'alert' })).toEqual([]);
  });

  it('applies the search and the tag together', () => {
    expect(keys(filterFlags(flags, { search: 'form', tag: 'birdwatch' }))).toEqual(['new-sighting-form']);
    expect(filterFlags(flags, { search: 'photo', tag: 'birdwatch' })).toEqual([]);
  });
});

describe('listedTags', () => {
  it('lists every tag of the flags once, in alphabetical order', () => {
    expect(listedTags(flags)).toEqual(['alerts', 'birdwatch', 'kill-switch']);
    expect(listedTags([])).toEqual([]);
  });
});
