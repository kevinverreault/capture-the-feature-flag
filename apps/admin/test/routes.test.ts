import { describe, expect, it } from 'vitest';
import { routes } from '../src/lib/routes.js';

describe('routes', () => {
  it('builds the address of each admin page', () => {
    expect(routes.projects()).toBe('/projects');
    expect(routes.project('birdwatch')).toBe('/projects/birdwatch');
    expect(routes.environments('birdwatch')).toBe('/projects/birdwatch/environments');
    expect(routes.environment('birdwatch', 'production')).toBe('/projects/birdwatch/environments/production');
    expect(routes.settings('birdwatch')).toBe('/projects/birdwatch/settings');
    expect(routes.telemetrySettings()).toBe('/settings');
    expect(routes.flags('birdwatch')).toBe('/projects/birdwatch/flags');
    // Outside /flags/, so that no flag key can take its address.
    expect(routes.newFlag('birdwatch')).toBe('/projects/birdwatch/new-flag');
    expect(routes.flag('birdwatch', 'rare-bird-alerts')).toBe('/projects/birdwatch/flags/rare-bird-alerts');
    expect(routes.editFlag('birdwatch', 'rare-bird-alerts')).toBe('/projects/birdwatch/flags/rare-bird-alerts/edit');
  });

  it('opens a flag on the tab of the environment given', () => {
    expect(routes.flag('birdwatch', 'rare-bird-alerts', 'production')).toBe(
      '/projects/birdwatch/flags/rare-bird-alerts?environment=production',
    );
    expect(routes.flag('a', 'b', 'c&d')).toBe('/projects/a/flags/b?environment=c%26d');
  });

  it('encodes each key as one path segment', () => {
    expect(routes.environment('a/b', 'c d?')).toBe('/projects/a%2Fb/environments/c%20d%3F');
  });
});
