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

  it('serves the admin app unless ADMIN_ENABLED is false', () => {
    expect(loadConfig({ DATABASE_URL: databaseUrl }).adminEnabled).toBe(true);
    expect(loadConfig({ DATABASE_URL: databaseUrl, ADMIN_ENABLED: 'false' }).adminEnabled).toBe(false);
    expect(() => loadConfig({ DATABASE_URL: databaseUrl, ADMIN_ENABLED: 'no' })).toThrow(/ADMIN_ENABLED/);
  });

  it('runs retention hourly unless RETENTION_INTERVAL_MS says otherwise', () => {
    expect(loadConfig({ DATABASE_URL: databaseUrl }).retentionIntervalMs).toBe(3_600_000);
    expect(loadConfig({ DATABASE_URL: databaseUrl, RETENTION_INTERVAL_MS: '' }).retentionIntervalMs).toBe(3_600_000);
    expect(loadConfig({ DATABASE_URL: databaseUrl, RETENTION_INTERVAL_MS: '500' }).retentionIntervalMs).toBe(500);
    expect(() => loadConfig({ DATABASE_URL: databaseUrl, RETENTION_INTERVAL_MS: '0' })).toThrow(
      /RETENTION_INTERVAL_MS/,
    );
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
