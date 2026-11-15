import type { AuditEntry } from '@ctff/core-api-client';
import { describe, expect, it } from 'vitest';
import { auditChanges, auditSummary, pageCursor } from '../src/lib/audit.js';

const base = {
  id: 1,
  projectKey: 'birdwatch',
  targetId: '6b0e6c1e-2c58-4bd6-9a2d-4f7e0e3f9a11',
  flagKey: null,
  environmentKey: null,
  actor: 'Ada',
  createdAt: '2026-11-15T12:00:00.000Z',
};

function entry(fields: Partial<AuditEntry> & Pick<AuditEntry, 'targetType' | 'action'>): AuditEntry {
  return { before: null, after: null, ...base, ...fields };
}

const offState = { on: false, offVariation: 1, defaultVariation: 0, individualTargets: [], rules: [], version: 1 };

describe('auditSummary', () => {
  it('says what was done to what', () => {
    expect(auditSummary(entry({ targetType: 'project', action: 'update' }))).toBe('Updated project birdwatch');
    expect(auditSummary(entry({ targetType: 'environment', action: 'create', environmentKey: 'production' }))).toBe(
      'Created environment production',
    );
    expect(auditSummary(entry({ targetType: 'flag', action: 'archive', flagKey: 'kill-switch' }))).toBe(
      'Archived flag kill-switch',
    );
    expect(
      auditSummary(
        entry({ targetType: 'targeting', action: 'update', flagKey: 'kill-switch', environmentKey: 'production' }),
      ),
    ).toBe('Updated targeting of kill-switch in production');
  });
});

describe('auditChanges', () => {
  it('lists only what an update changed, by readable field names', () => {
    const changes = auditChanges(
      entry({
        targetType: 'flag',
        action: 'update',
        before: { key: 'kill-switch', name: 'Kill', description: '', tags: [], managedBy: null, version: 1 },
        after: {
          key: 'kill-switch',
          name: 'Kill switch',
          description: 'Stops it',
          tags: ['ops', 'alerts'],
          managedBy: 'terraform',
          version: 2,
        },
      }),
    );
    expect(changes).toEqual([
      { field: 'Name', before: ['Kill'], after: ['Kill switch'] },
      { field: 'Description', before: ['(empty)'], after: ['Stops it'] },
      { field: 'Tags', before: ['(none)'], after: ['ops, alerts'] },
      { field: 'Managed by', before: ['(none)'], after: ['terraform'] },
      { field: 'Version', before: ['1'], after: ['2'] },
    ]);
  });

  it('lists every field of a create as added, and of a delete as removed', () => {
    const state = { key: 'production', name: 'Production', sdkKey: 'ctff-env-abc' };
    expect(auditChanges(entry({ targetType: 'environment', action: 'create', after: state }))).toEqual([
      { field: 'Key', after: ['production'] },
      { field: 'Name', after: ['Production'] },
      { field: 'SDK key', after: ['ctff-env-abc'] },
    ]);
    expect(auditChanges(entry({ targetType: 'environment', action: 'delete', before: state }))).toEqual([
      { field: 'Key', before: ['production'] },
      { field: 'Name', before: ['Production'] },
      { field: 'SDK key', before: ['ctff-env-abc'] },
    ]);
  });

  it('shows targeting with variations by value and rules one per line', () => {
    const after = {
      ...offState,
      on: true,
      individualTargets: [{ variation: 0, userIds: ['ada', 'grace'] }],
      rules: [
        { attribute: 'country', operator: 'in', values: ['CA', 'FR'], variation: 0 },
        { attribute: 'user_id', operator: 'not_in', values: ['linus'], variation: 1 },
      ],
      version: 2,
    };
    const changes = auditChanges(entry({ targetType: 'targeting', action: 'update', before: offState, after }), [
      true,
      false,
    ]);
    expect(changes).toEqual([
      { field: 'Targeting', before: ['off'], after: ['on'] },
      { field: 'Individual targets', before: ['(none)'], after: ['ada, grace → true'] },
      {
        field: 'Rules',
        before: ['(none)'],
        after: ['1. country in CA, FR → true', '2. user_id not in linus → false'],
      },
      { field: 'Version', before: ['1'], after: ['2'] },
    ]);
  });

  it('names variations by index when the flag is not known', () => {
    const after = { ...offState, offVariation: 0 };
    expect(auditChanges(entry({ targetType: 'targeting', action: 'update', before: offState, after }))).toEqual([
      { field: 'Off variation', before: ['variation 1'], after: ['variation 0'] },
    ]);
  });

  it('shows a value it has no format for as JSON', () => {
    const changes = auditChanges(
      entry({ targetType: 'flag', action: 'update', before: { extra: { a: 1 } }, after: { extra: { a: 2 } } }),
    );
    expect(changes).toEqual([{ field: 'Extra', before: ['{"a":1}'], after: ['{"a":2}'] }]);
  });
});

describe('pageCursor', () => {
  it('reads the cursor of a page of older entries, ignoring anything else', () => {
    expect(pageCursor('42')).toBe(42);
    for (const value of [null, '', '0', '-1', '1.5', 'abc', '99999999999999999999']) {
      expect(pageCursor(value)).toBeUndefined();
    }
  });
});
