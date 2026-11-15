import { describe, expect, it } from 'vitest';
import {
  evaluate,
  type Context,
  type EnvironmentSnapshot,
  type EvaluationResult,
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
