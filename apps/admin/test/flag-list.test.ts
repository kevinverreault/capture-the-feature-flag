import { describe, expect, it } from 'vitest';
import { filterFlags, flagListCaption, listedTags } from '../src/lib/flag-list.js';

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

  it('matches the tag ignoring case, like the search', () => {
    expect(keys(filterFlags(flags, { tag: 'BirdWatch' }))).toEqual(['new-sighting-form', 'rare-bird-alerts']);
  });

  it('applies the search and the tag together', () => {
    expect(keys(filterFlags(flags, { search: 'form', tag: 'birdwatch' }))).toEqual(['new-sighting-form']);
    expect(filterFlags(flags, { search: 'photo', tag: 'birdwatch' })).toEqual([]);
  });
});

describe('filterFlags with archived flags', () => {
  const withArchived = [
    { key: 'new-sighting-form', name: 'New sighting form', tags: ['birdwatch'], archived: false },
    { key: 'old-feed', name: 'Old feed', tags: ['birdwatch'], archived: true },
  ];

  it('hides archived flags unless they are asked for', () => {
    expect(keys(filterFlags(withArchived, {}))).toEqual(['new-sighting-form']);
    expect(keys(filterFlags(withArchived, { showArchived: false }))).toEqual(['new-sighting-form']);
    expect(keys(filterFlags(withArchived, { showArchived: true }))).toEqual(['new-sighting-form', 'old-feed']);
  });

  it('searches and filters archived flags too while they are shown', () => {
    expect(keys(filterFlags(withArchived, { showArchived: true, search: 'old', tag: 'birdwatch' }))).toEqual([
      'old-feed',
    ]);
    expect(filterFlags(withArchived, { search: 'old' })).toEqual([]);
  });
});

describe('listedTags', () => {
  it('lists every tag of the flags once, in alphabetical order', () => {
    expect(listedTags(flags)).toEqual(['alerts', 'birdwatch', 'kill-switch']);
    expect(listedTags([])).toEqual([]);
  });
});

describe('flagListCaption', () => {
  it('counts the flags shown, in the singular for one', () => {
    expect(flagListCaption(1, 1, false)).toBe('1 flag, with targeting on or off in each environment');
    expect(flagListCaption(3, 3, false)).toBe('3 flags, with targeting on or off in each environment');
  });

  it('counts the flags shown out of all of them while filtered', () => {
    expect(flagListCaption(1, 1, true)).toBe('1 of 1 flag, with targeting on or off in each environment');
    expect(flagListCaption(1, 3, true)).toBe('1 of 3 flags, with targeting on or off in each environment');
  });
});
