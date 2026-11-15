import { describe, expect, it } from 'vitest';
import { formatTags, parseTags } from '../src/lib/tags.js';

describe('parseTags', () => {
  it('splits the comma-separated tags, trimming each', () => {
    expect(parseTags('birdwatch, alerts ,kill switch')).toEqual(['birdwatch', 'alerts', 'kill switch']);
  });

  it('reads blank input, and blank entries, as no tags', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags(' , ,')).toEqual([]);
    expect(parseTags('alerts,, beta,')).toEqual(['alerts', 'beta']);
  });

  it('keeps a repeated tag once', () => {
    expect(parseTags('alerts, beta, alerts')).toEqual(['alerts', 'beta']);
  });
});

describe('formatTags', () => {
  it('writes the tags for the input that parseTags reads', () => {
    expect(formatTags(['birdwatch', 'kill switch'])).toBe('birdwatch, kill switch');
    expect(formatTags([])).toBe('');
  });
});
