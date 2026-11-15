import { describe, expect, it } from 'vitest';
import { contextFromQuery, contextLabel, evaluationReasonText, sameContext } from '../src/lib/contexts.js';

describe('evaluationReasonText', () => {
  it('says why each evaluation produced its variation', () => {
    expect(evaluationReasonText({ kind: 'OFF' })).toBe('Targeting off');
    expect(evaluationReasonText({ kind: 'TARGET_MATCH' })).toBe('Individual target');
    // Rules are numbered from 1, as the targeting editor shows them.
    expect(evaluationReasonText({ kind: 'RULE_MATCH', ruleIndex: 0 })).toBe('Rule 1 matched');
    expect(evaluationReasonText({ kind: 'RULE_MATCH', ruleIndex: 2 })).toBe('Rule 3 matched');
    expect(evaluationReasonText({ kind: 'DEFAULT' })).toBe('Default variation');
    expect(evaluationReasonText({ kind: 'FLAG_NOT_FOUND' })).toBe('Flag not found');
    expect(evaluationReasonText({ kind: 'ERROR', errorKind: 'MALFORMED_FLAG' })).toBe(
      'Error: the targeting refers to a variation the flag does not have',
    );
    expect(evaluationReasonText({ kind: 'ERROR', errorKind: 'MALFORMED_CONTEXT' })).toBe(
      'Error: the context is malformed',
    );
    expect(evaluationReasonText({ kind: 'ERROR' })).toBe('Error');
  });
});

describe('contextFromQuery', () => {
  it('reads the selected context from the address', () => {
    expect(contextFromQuery(new URLSearchParams('user_id=alice&country=CA'))).toEqual({
      user_id: 'alice',
      country: 'CA',
    });
    expect(contextFromQuery(new URLSearchParams('country=fr&environment=production'))).toEqual({ country: 'fr' });
    expect(contextFromQuery(new URLSearchParams('user_id=bob&country='))).toEqual({ user_id: 'bob' });
  });

  it('selects no context without any context attribute', () => {
    expect(contextFromQuery(new URLSearchParams(''))).toBeUndefined();
    expect(contextFromQuery(new URLSearchParams('user_id=&country=&search=al'))).toBeUndefined();
  });
});

describe('contextLabel', () => {
  it('names a context by its attributes', () => {
    expect(contextLabel({ user_id: 'alice', country: 'CA' })).toBe('alice in CA');
    expect(contextLabel({ user_id: 'alice' })).toBe('alice');
    expect(contextLabel({ country: 'FR' })).toBe('Someone in FR');
    expect(contextLabel({})).toBe('An empty context');
  });
});

describe('sameContext', () => {
  it('compares contexts by their attributes, countries ignoring case', () => {
    expect(sameContext({ user_id: 'alice', country: 'CA' }, { country: 'ca', user_id: 'alice' })).toBe(true);
    expect(sameContext({ user_id: 'alice' }, { user_id: 'alice', country: 'CA' })).toBe(false);
    expect(sameContext({ user_id: 'alice' }, { user_id: 'Alice' })).toBe(false);
    expect(sameContext({ user_id: 'alice' }, undefined)).toBe(false);
  });
});
