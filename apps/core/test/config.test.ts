import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('configuration', () => {
  const databaseUrl = 'postgres://ctff:ctff@localhost:5432/ctff';

  it('defaults the port when PORT is unset or empty', () => {
    expect(loadConfig({ DATABASE_URL: databaseUrl }).port).toBe(3000);
    expect(loadConfig({ DATABASE_URL: databaseUrl, PORT: '' }).port).toBe(3000);
    expect(loadConfig({ DATABASE_URL: databaseUrl, PORT: ' ' }).port).toBe(3000);
  });

  it('rejects a port that is not a number', () => {
    expect(() => loadConfig({ DATABASE_URL: databaseUrl, PORT: 'http' })).toThrow(/PORT/);
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
