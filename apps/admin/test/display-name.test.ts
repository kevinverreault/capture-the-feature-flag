import { describe, expect, it } from 'vitest';
import { displayNameMaxLength, normalizeDisplayName, returnPath } from '../src/lib/display-name.js';

describe('returnPath', () => {
  it('goes back to a page of the admin app', () => {
    expect(returnPath('/projects/birdwatch/flags?tag=alerts', '/projects')).toBe(
      '/projects/birdwatch/flags?tag=alerts',
    );
  });

  it('never leads to another site', () => {
    for (const value of ['https://example.com/', '//example.com/', '/\\example.com', 'projects', '', null, undefined]) {
      expect(returnPath(value, '/projects')).toBe('/projects');
    }
  });
});

describe('normalizeDisplayName', () => {
  it('keeps one space between words, without surrounding spaces', () => {
    expect(normalizeDisplayName('  Zoë \t  Ørn \n')).toBe('Zoë Ørn');
    expect(normalizeDisplayName(' \t ')).toBe('');
  });

  it('cuts a long name to the longest a display name can be', () => {
    expect(normalizeDisplayName('a'.repeat(displayNameMaxLength + 10))).toBe('a'.repeat(displayNameMaxLength));
  });
});
