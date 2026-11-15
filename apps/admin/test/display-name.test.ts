import { describe, expect, it } from 'vitest';
import { returnPath } from '../src/lib/display-name.js';

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
