import type { EnvironmentSnapshot, Variation } from './snapshot.js';

/**
 * Whoever a flag is evaluated for. V1 has the two built-in context attributes: `user_id`, any non-empty string,
 * and `country`, an ISO 3166-1 alpha-2 code. Either may be missing; a rule on a missing attribute never matches.
 */
export interface Context {
  user_id?: string;
  country?: string;
}

/** What went wrong when an evaluation reason is `ERROR`. */
export const evaluationErrorKinds = [
  /** The flag's targeting refers to a variation it doesn't have. */
  'MALFORMED_FLAG',
  /** The context isn't an object, or one of its attributes has the wrong type or format. */
  'MALFORMED_CONTEXT',
  /** The Evaluator doesn't know the SDK key. */
  'UNKNOWN_SDK_KEY',
  /** The Evaluator hasn't loaded its first snapshot yet. */
  'NOT_READY',
  /** The SDK gave up waiting for the Evaluator. */
  'TIMEOUT',
  /** The SDK couldn't reach the Evaluator. */
  'NETWORK_ERROR',
  /** The Evaluator answered with an error or with something the SDK doesn't understand. */
  'EVALUATOR_ERROR',
] as const;
export type EvaluationErrorKind = (typeof evaluationErrorKinds)[number];

/** Why an evaluation produced its variation. */
export type EvaluationReason =
  | { kind: 'OFF' }
  | { kind: 'DEFAULT' }
  | { kind: 'FLAG_NOT_FOUND' }
  | { kind: 'ERROR'; errorKind: EvaluationErrorKind };

/**
 * The outcome of one evaluation. When no variation is served (flag not found, or an error) `value` and
 * `variationIndex` are `null`, and the SDK returns the caller's fallback value instead.
 */
export type EvaluationResult =
  | { value: Variation; variationIndex: number; reason: Extract<EvaluationReason, { kind: 'OFF' | 'DEFAULT' }> }
  | { value: null; variationIndex: null; reason: Extract<EvaluationReason, { kind: 'FLAG_NOT_FOUND' | 'ERROR' }> };

const error = (errorKind: EvaluationErrorKind): EvaluationResult => ({
  value: null,
  variationIndex: null,
  reason: { kind: 'ERROR', errorKind },
});

/**
 * Works out which variation a flag serves to a context in the environment of the snapshot. Pure, and total: it
 * never throws, whatever it's given, and reports malformed input with the `ERROR` reason.
 */
export function evaluate(snapshot: EnvironmentSnapshot, flagKey: string, context: Context): EvaluationResult {
  const flag = snapshot.flags.find((candidate) => candidate.key === flagKey);
  if (!flag) return { value: null, variationIndex: null, reason: { kind: 'FLAG_NOT_FOUND' } };
  if (!normalizeContext(context)) return error('MALFORMED_CONTEXT');

  const { targeting } = flag;
  const [index, reason]: [number, { kind: 'OFF' | 'DEFAULT' }] = targeting.on
    ? [targeting.defaultVariation, { kind: 'DEFAULT' }]
    : [targeting.offVariation, { kind: 'OFF' }];
  if (!Number.isInteger(index) || index < 0 || index >= flag.variations.length) return error('MALFORMED_FLAG');
  return { value: flag.variations[index] as Variation, variationIndex: index, reason };
}

/**
 * The context with absent (`undefined` or `null`) attributes left out and `country` in uppercase, or `null` when
 * it is malformed. Context attributes V1 doesn't know are ignored.
 */
function normalizeContext(context: unknown): Context | null {
  if (typeof context !== 'object' || context === null || Array.isArray(context)) return null;
  const { user_id: userId, country } = context as Record<string, unknown>;
  const normalized: Context = {};
  if (userId !== undefined && userId !== null) {
    if (typeof userId !== 'string' || userId === '') return null;
    normalized.user_id = userId;
  }
  if (country !== undefined && country !== null) {
    if (typeof country !== 'string' || !/^[A-Za-z]{2}$/.test(country)) return null;
    normalized.country = country.toUpperCase();
  }
  return normalized;
}
