import { describe, expect, it } from 'vitest';
import {
  contextFromQuery,
  contextLabel,
  evaluationReasonText,
  moreSeenContexts,
  sameContext,
  seenContextsShown,
} from '../src/lib/contexts.js';

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

describe('seenContextsShown', () => {
  it('shows the newest 100 seen contexts by default, then 100 more at a time', () => {
    expect(seenContextsShown(null)).toBe(100);
    expect(seenContextsShown('200')).toBe(200);
    expect(seenContextsShown('1000')).toBe(1000);
  });

  it('rounds what the address asks for up to a whole step, within 100 and the 1,000 Core lists at most', () => {
    expect(seenContextsShown('150')).toBe(200);
    expect(seenContextsShown('0')).toBe(100);
    expect(seenContextsShown('-300')).toBe(100);
    expect(seenContextsShown('5000')).toBe(1000);
    expect(seenContextsShown('lots')).toBe(100);
  });
});

describe('moreSeenContexts', () => {
  it('offers 100 more while the list is full, up to the 1,000 Core lists at most', () => {
    expect(moreSeenContexts(100, 100)).toBe(200);
    expect(moreSeenContexts(900, 900)).toBe(1000);
    // Fewer listed than asked for: there are no more.
    expect(moreSeenContexts(100, 42)).toBeUndefined();
    expect(moreSeenContexts(1000, 1000)).toBeUndefined();
  });
});
