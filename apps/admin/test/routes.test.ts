import { describe, expect, it } from 'vitest';
import { routes } from '../src/lib/routes.js';

describe('routes', () => {
  it('builds the address of each admin page', () => {
    expect(routes.projects()).toBe('/projects');
    expect(routes.project('birdwatch')).toBe('/projects/birdwatch');
    expect(routes.environments('birdwatch')).toBe('/projects/birdwatch/environments');
    expect(routes.environment('birdwatch', 'production')).toBe('/projects/birdwatch/environments/production');
    expect(routes.settings('birdwatch')).toBe('/projects/birdwatch/settings');
    expect(routes.installSettings()).toBe('/settings');
  });

  it('encodes each key as one path segment', () => {
    expect(routes.environment('a/b', 'c d?')).toBe('/projects/a%2Fb/environments/c%20d%3F');
  });
});
