import { describe, expect, it } from 'vitest';
import { adminAppFromEnv, adminFlagUrl, inspectedFlags, reasonLabel } from '../src/lib/inspector';

describe('reasonLabel', () => {
  it('names the evaluation reason as the Evaluator does', () => {
    expect(reasonLabel({ kind: 'OFF' })).toBe('OFF');
    expect(reasonLabel({ kind: 'TARGET_MATCH' })).toBe('TARGET_MATCH');
    expect(reasonLabel({ kind: 'DEFAULT' })).toBe('DEFAULT');
    expect(reasonLabel({ kind: 'FLAG_NOT_FOUND' })).toBe('FLAG_NOT_FOUND');
  });

  it('says which rule matched, counting from 1 as the admin app does', () => {
    expect(reasonLabel({ kind: 'RULE_MATCH', ruleIndex: 0 })).toBe('RULE_MATCH (rule 1)');
  });

  it('says what went wrong for an error', () => {
    expect(reasonLabel({ kind: 'ERROR', errorKind: 'TIMEOUT' })).toBe('ERROR (TIMEOUT)');
  });
});

describe('adminFlagUrl', () => {
  const admin = { url: 'http://localhost:3000', projectKey: 'birdwatch', environmentKey: 'development' };

  it("links to the flag's page in the admin app, on the tab of the environment", () => {
    expect(adminFlagUrl(admin, 'rare-bird-alerts')).toBe(
      'http://localhost:3000/projects/birdwatch/flags/rare-bird-alerts?environment=development',
    );
  });

  it('keeps a path the admin app is served under', () => {
    expect(adminFlagUrl({ ...admin, url: 'https://flags.example.com/ctff' }, 'photo-id-beta')).toBe(
      'https://flags.example.com/ctff/projects/birdwatch/flags/photo-id-beta?environment=development',
    );
  });

  it('has no link when the admin app address is unknown', () => {
    expect(adminFlagUrl({ ...admin, url: '' }, 'photo-id-beta')).toBeUndefined();
  });
});

describe('inspectedFlags', () => {
  it('lists every evaluated flag by key, with its variation and reason', () => {
    const flags = {
      values: { 'rare-bird-alerts': true, 'new-sighting-form': true },
      details: {
        'rare-bird-alerts': { value: true, variationIndex: 0, reason: { kind: 'RULE_MATCH', ruleIndex: 0 } },
        'photo-id-beta': { value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' } },
        'new-sighting-form': { value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } },
      },
      error: null,
    } as const;
    expect(inspectedFlags(flags).map(({ key, value, reason }) => ({ key, value, reason }))).toEqual([
      { key: 'new-sighting-form', value: true, reason: 'DEFAULT' },
      { key: 'photo-id-beta', value: null, reason: 'ERROR (MALFORMED_FLAG)' },
      { key: 'rare-bird-alerts', value: true, reason: 'RULE_MATCH (rule 1)' },
    ]);
  });
});

describe('adminAppFromEnv', () => {
  it("reads the admin app's address without trailing slashes, with the project and environment", () => {
    expect(
      adminAppFromEnv({ CTFF_ADMIN_URL: ' http://localhost:3000/ ', CTFF_PROJECT: 'demo', CTFF_ENVIRONMENT: 'prod' }),
    ).toEqual({ url: 'http://localhost:3000', projectKey: 'demo', environmentKey: 'prod' });
  });

  it('has no address, and the demo project and environment, when unset or empty', () => {
    expect(adminAppFromEnv({ CTFF_PROJECT: '', CTFF_ENVIRONMENT: ' ' })).toEqual({
      url: '',
      projectKey: 'birdwatch',
      environmentKey: 'development',
    });
  });
});
