import { describe, expect, it } from 'vitest';
import {
  evaluate,
  isCountryCode,
  type Context,
  type EnvironmentSnapshot,
  type EvaluationResult,
  type Rule,
  type TargetingSnapshot,
} from '../src/index.js';

function snapshot(targeting: Partial<TargetingSnapshot> = {}): EnvironmentSnapshot {
  return {
    projectKey: 'birdwatch',
    environmentKey: 'production',
    flags: [
      {
        key: 'rare-bird-alerts',
        variations: [true, false],
        version: 1,
        targeting: {
          on: false,
          offVariation: 1,
          defaultVariation: 0,
          individualTargets: [],
          rules: [],
          version: 1,
          ...targeting,
        },
      },
    ],
  };
}

describe('evaluate', () => {
  it.each<[string, Partial<TargetingSnapshot>, EvaluationResult]>([
    ['targeting off serves the off variation', {}, { value: false, variationIndex: 1, reason: { kind: 'OFF' } }],
    [
      'targeting off serves whichever variation is the off variation',
      { offVariation: 0 },
      { value: true, variationIndex: 0, reason: { kind: 'OFF' } },
    ],
    [
      'targeting on serves the default variation',
      { on: true },
      { value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } },
    ],
    [
      'targeting on serves whichever variation is the default variation',
      { on: true, defaultVariation: 1 },
      { value: false, variationIndex: 1, reason: { kind: 'DEFAULT' } },
    ],
  ])('%s', (_case, targeting, expected) => {
    expect(evaluate(snapshot(targeting), 'rare-bird-alerts', { user_id: 'alice', country: 'CA' })).toEqual(expected);
  });
});

describe('evaluate when no variation can be served', () => {
  const notFound: EvaluationResult = { value: null, variationIndex: null, reason: { kind: 'FLAG_NOT_FOUND' } };

  it.each<[string, EnvironmentSnapshot, string]>([
    ['a flag key the project does not have', snapshot({ on: true }), 'photo-id-beta'],
    ['flag keys compared exactly', snapshot({ on: true }), 'Rare-Bird-Alerts'],
    ['an environment without flags', { ...snapshot(), flags: [] }, 'rare-bird-alerts'],
  ])('reports FLAG_NOT_FOUND for %s', (_case, environment, flagKey) => {
    expect(evaluate(environment, flagKey, { user_id: 'alice' })).toEqual(notFound);
  });

  const malformedFlag: EvaluationResult = {
    value: null,
    variationIndex: null,
    reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' },
  };

  it.each<[string, Partial<TargetingSnapshot>]>([
    ['an off variation past the last variation', { offVariation: 2 }],
    ['a negative off variation', { offVariation: -1 }],
    ['a fractional off variation', { offVariation: 0.5 }],
    ['a default variation past the last variation', { on: true, defaultVariation: 2 }],
  ])('reports a MALFORMED_FLAG error for %s', (_case, targeting) => {
    expect(evaluate(snapshot(targeting), 'rare-bird-alerts', { user_id: 'alice' })).toEqual(malformedFlag);
  });

  const malformedContext: EvaluationResult = {
    value: null,
    variationIndex: null,
    reason: { kind: 'ERROR', errorKind: 'MALFORMED_CONTEXT' },
  };

  it.each<[string, unknown]>([
    ['a context that is not an object', 'alice'],
    ['a missing context', undefined],
    ['a null context', null],
    ['an array context', ['alice']],
    ['an empty user_id', { user_id: '' }],
    ['a user_id that is not a string', { user_id: 42 }],
    ['a country that is not two letters', { country: 'CAN' }],
    ['a country that is not a string', { country: 1 }],
  ])('reports a MALFORMED_CONTEXT error for %s', (_case, context) => {
    expect(evaluate(snapshot({ on: true }), 'rare-bird-alerts', context as Context)).toEqual(malformedContext);
  });

  it.each<[string, unknown]>([
    ['an empty context', {}],
    ['a context with only a user_id', { user_id: 'alice' }],
    ['a context with only a country', { country: 'NL' }],
    ['a lowercase country', { country: 'nl' }],
    ['attributes set to null, which count as missing', { user_id: null, country: null }],
    ['attributes V1 does not know, which are ignored', { user_id: 'alice', plan: 'pro' }],
  ])('evaluates %s', (_case, context) => {
    expect(evaluate(snapshot({ on: true }), 'rare-bird-alerts', context as Context)).toEqual({
      value: true,
      variationIndex: 0,
      reason: { kind: 'DEFAULT' },
    });
  });
});

describe('evaluate with individual targets', () => {
  const targets: Partial<TargetingSnapshot> = {
    on: true,
    individualTargets: [
      { variation: 1, userIds: ['bob', 'carol'] },
      { variation: 0, userIds: ['dave'] },
    ],
  };

  it.each<[string, Partial<TargetingSnapshot>, Context, EvaluationResult]>([
    [
      'serves the variation of the target listing the user ID',
      targets,
      { user_id: 'carol', country: 'CA' },
      { value: false, variationIndex: 1, reason: { kind: 'TARGET_MATCH' } },
    ],
    [
      'serves each target its own variation',
      { ...targets, defaultVariation: 1 },
      { user_id: 'dave' },
      { value: true, variationIndex: 0, reason: { kind: 'TARGET_MATCH' } },
    ],
    [
      'serves the default variation to a user ID no target lists',
      targets,
      { user_id: 'alice' },
      { value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } },
    ],
    [
      'compares user IDs exactly',
      targets,
      { user_id: 'Bob' },
      { value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } },
    ],
    [
      'never matches a context without a user_id',
      targets,
      { country: 'CA' },
      { value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } },
    ],
    [
      'are ignored while targeting is off',
      { ...targets, on: false },
      { user_id: 'bob' },
      { value: false, variationIndex: 1, reason: { kind: 'OFF' } },
    ],
  ])('%s', (_case, targeting, context, expected) => {
    expect(evaluate(snapshot(targeting), 'rare-bird-alerts', context)).toEqual(expected);
  });
});

describe('evaluate with rules', () => {
  const rule = (
    attribute: Rule['attribute'],
    operator: Rule['operator'],
    values: string[],
    variation: number,
  ): Rule => ({ attribute, operator, values, variation });
  const on = (...rules: Rule[]): Partial<TargetingSnapshot> => ({ on: true, defaultVariation: 1, rules });
  const ruleMatch = (variationIndex: number, ruleIndex: number): EvaluationResult => ({
    value: variationIndex === 0,
    variationIndex,
    reason: { kind: 'RULE_MATCH', ruleIndex },
  });
  const byDefault: EvaluationResult = { value: false, variationIndex: 1, reason: { kind: 'DEFAULT' } };

  it.each<[string, Partial<TargetingSnapshot>, Context, EvaluationResult]>([
    [
      'country in matches a listed country',
      on(rule('country', 'in', ['CA', 'US'], 0)),
      { country: 'US' },
      ruleMatch(0, 0),
    ],
    [
      'country in matches a lowercase context country',
      on(rule('country', 'in', ['CA'], 0)),
      { country: 'ca' },
      ruleMatch(0, 0),
    ],
    [
      'country in does not match an unlisted country',
      on(rule('country', 'in', ['CA'], 0)),
      { country: 'NL' },
      byDefault,
    ],
    [
      'country not in matches an unlisted country',
      on(rule('country', 'not_in', ['CA'], 0)),
      { country: 'NL' },
      ruleMatch(0, 0),
    ],
    [
      'country not in does not match a listed country',
      on(rule('country', 'not_in', ['CA'], 0)),
      { country: 'CA' },
      byDefault,
    ],
    [
      'user_id in matches a listed user ID',
      on(rule('user_id', 'in', ['alice'], 0)),
      { user_id: 'alice' },
      ruleMatch(0, 0),
    ],
    ['user_id in compares user IDs exactly', on(rule('user_id', 'in', ['alice'], 0)), { user_id: 'Alice' }, byDefault],
    [
      'user_id not in matches an unlisted user ID',
      on(rule('user_id', 'not_in', ['alice'], 0)),
      { user_id: 'bob' },
      ruleMatch(0, 0),
    ],
    [
      'user_id not in does not match a listed user ID',
      on(rule('user_id', 'not_in', ['alice'], 0)),
      { user_id: 'alice' },
      byDefault,
    ],
    ['a missing country never matches in', on(rule('country', 'in', ['CA'], 0)), { user_id: 'alice' }, byDefault],
    [
      'a missing country never matches not in',
      on(rule('country', 'not_in', ['CA'], 0)),
      { user_id: 'alice' },
      byDefault,
    ],
    ['a missing user_id never matches in', on(rule('user_id', 'in', ['alice'], 0)), { country: 'CA' }, byDefault],
    [
      'a missing user_id never matches not in',
      on(rule('user_id', 'not_in', ['alice'], 0)),
      { country: 'CA' },
      byDefault,
    ],
    [
      'a null attribute never matches not in',
      on(rule('country', 'not_in', ['CA'], 0)),
      { country: null } as unknown as Context,
      byDefault,
    ],
    [
      'the first matching rule wins',
      on(rule('country', 'in', ['NL'], 1), rule('country', 'in', ['CA'], 0), rule('user_id', 'in', ['alice'], 1)),
      { user_id: 'alice', country: 'CA' },
      ruleMatch(0, 1),
    ],
    [
      'rules are tried in order, whatever their attribute',
      on(rule('user_id', 'in', ['alice'], 1), rule('country', 'in', ['CA'], 0)),
      { user_id: 'alice', country: 'CA' },
      ruleMatch(1, 0),
    ],
    [
      'the default variation is served when no rule matches',
      on(rule('country', 'in', ['NL'], 0), rule('user_id', 'in', ['bob'], 0)),
      { user_id: 'alice', country: 'CA' },
      byDefault,
    ],
    [
      'individual targets take priority over rules',
      {
        ...on(rule('country', 'in', ['CA'], 0)),
        individualTargets: [{ variation: 1, userIds: ['alice'] }],
      },
      { user_id: 'alice', country: 'CA' },
      { value: false, variationIndex: 1, reason: { kind: 'TARGET_MATCH' } },
    ],
    [
      'rules apply to contexts no individual target lists',
      {
        ...on(rule('country', 'in', ['CA'], 0)),
        individualTargets: [{ variation: 1, userIds: ['alice'] }],
      },
      { user_id: 'bob', country: 'CA' },
      ruleMatch(0, 0),
    ],
    [
      'country rules match whatever the case of their values',
      on(rule('country', 'in', ['ca'], 0)),
      { country: 'CA' },
      ruleMatch(0, 0),
    ],
    [
      'country not in rules compare whatever the case of their values',
      on(rule('country', 'not_in', ['ca'], 0)),
      { country: 'CA' },
      byDefault,
    ],
    [
      'rules are ignored while targeting is off',
      { ...on(rule('country', 'in', ['CA'], 0)), on: false },
      { country: 'CA' },
      { value: false, variationIndex: 1, reason: { kind: 'OFF' } },
    ],
  ])('%s', (_case, targeting, context, expected) => {
    expect(evaluate(snapshot(targeting), 'rare-bird-alerts', context)).toEqual(expected);
  });

  const malformedFlag: EvaluationResult = {
    value: null,
    variationIndex: null,
    reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' },
  };

  it.each<[string, Partial<TargetingSnapshot>]>([
    ['a matching rule serving a variation the flag does not have', on(rule('country', 'in', ['CA'], 2))],
    [
      'a matching individual target serving a variation the flag does not have',
      {
        on: true,
        individualTargets: [{ variation: 5, userIds: ['alice'] }],
      },
    ],
    [
      'a rule on an attribute V1 does not know',
      on({ ...rule('country', 'in', ['CA'], 0), attribute: 'plan' as Rule['attribute'] }),
    ],
    [
      'a rule with an operator V1 does not know',
      on({ ...rule('country', 'in', ['CA'], 0), operator: 'starts_with' as Rule['operator'] }),
    ],
    [
      'a rule whose values are not a list',
      on({ ...rule('country', 'in', ['CA'], 0), values: 'CA' as unknown as string[] }),
    ],
    ['rules that are not a list', { on: true, rules: {} as unknown as Rule[] }],
    [
      'a malformed rule after the rule that matches',
      on(rule('country', 'in', ['CA'], 0), {
        ...rule('country', 'in', ['NL'], 0),
        operator: 'like' as Rule['operator'],
      }),
    ],
    ['a rule that does not match serving a variation the flag does not have', on(rule('country', 'in', ['NL'], 9))],
    [
      'an individual target that does not match with a fractional variation',
      { on: true, individualTargets: [{ variation: 0.5, userIds: ['bob'] }] },
    ],
    ['an off variation the flag does not have while targeting is on', { on: true, offVariation: 2 }],
    ['a default variation the flag does not have while targeting is off', { defaultVariation: 2 }],
    ['individual targets that are not a list', { on: true, individualTargets: null as unknown as [] }],
  ])('reports a MALFORMED_FLAG error for %s', (_case, targeting) => {
    expect(evaluate(snapshot(targeting), 'rare-bird-alerts', { user_id: 'alice', country: 'CA' })).toEqual(
      malformedFlag,
    );
  });
});

describe('isCountryCode', () => {
  it.each(['CA', 'nl', 'Us', 'GB', 'AX'])('accepts the assigned code %s', (code) => {
    expect(isCountryCode(code)).toBe(true);
  });
  it.each(['XX', 'UK', 'EU', 'CAN', 'C', ''])('rejects %s', (code) => {
    expect(isCountryCode(code)).toBe(false);
  });
});
