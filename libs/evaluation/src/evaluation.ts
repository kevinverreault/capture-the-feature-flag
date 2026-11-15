import {
  contextAttributeKeys,
  type EnvironmentSnapshot,
  type Rule,
  ruleOperators,
  type TargetingSnapshot,
  type Variation,
} from './snapshot.js';

/**
 * Whoever a flag is evaluated for. V1 has the two built-in context attributes: `user_id`, any non-empty string,
 * and `country`, an ISO 3166-1 alpha-2 code. Either may be missing; a rule on a missing attribute never matches.
 */
export interface Context {
  user_id?: string;
  country?: string;
}

/**
 * What went wrong when `evaluate()` reports the `ERROR` reason. The Evaluator and the SDK add error kinds of their
 * own (an unknown SDK key, a timeout, …), for evaluations that can't even be attempted.
 */
export const evaluationErrorKinds = [
  /** The flag's targeting refers to a variation it doesn't have. */
  'MALFORMED_FLAG',
  /** The context isn't an object, or one of its attributes has the wrong type or format. */
  'MALFORMED_CONTEXT',
] as const;
export type EvaluationErrorKind = (typeof evaluationErrorKinds)[number];

/** Why an evaluation produced its variation. `ErrorKind` is widened by callers that add error kinds of their own. */
export type EvaluationReason<ErrorKind extends string = EvaluationErrorKind> =
  | { kind: 'OFF' }
  | { kind: 'TARGET_MATCH' }
  /** `ruleIndex` is the index, in the targeting's ordered rules, of the first rule that matched. */
  | { kind: 'RULE_MATCH'; ruleIndex: number }
  | { kind: 'DEFAULT' }
  | { kind: 'FLAG_NOT_FOUND' }
  | { kind: 'ERROR'; errorKind: ErrorKind };

/** The evaluation reasons that come with a served variation. */
export type ServedReason = Extract<EvaluationReason, { kind: 'OFF' | 'TARGET_MATCH' | 'RULE_MATCH' | 'DEFAULT' }>;

/**
 * The outcome of one evaluation. When no variation is served (flag not found, or an error) `value` and
 * `variationIndex` are `null`, and the SDK returns the caller's fallback value instead.
 */
export type EvaluationResult =
  | { value: Variation; variationIndex: number; reason: ServedReason }
  | { value: null; variationIndex: null; reason: Extract<EvaluationReason, { kind: 'FLAG_NOT_FOUND' | 'ERROR' }> };

const error = (errorKind: EvaluationErrorKind): EvaluationResult => ({
  value: null,
  variationIndex: null,
  reason: { kind: 'ERROR', errorKind },
});

/**
 * Works out which variation a flag serves to a context in the environment of the snapshot. Pure, and total: it
 * never throws, whatever it's given, and reports malformed input with the `ERROR` reason. The context is checked
 * at runtime, since it usually arrives over the wire; a missing one is a `MALFORMED_CONTEXT` error.
 */
export function evaluate(
  snapshot: EnvironmentSnapshot,
  flagKey: string,
  context: Context | undefined,
): EvaluationResult {
  const flag = snapshot.flags.find((candidate) => candidate.key === flagKey);
  if (!flag) return { value: null, variationIndex: null, reason: { kind: 'FLAG_NOT_FOUND' } };
  const normalized = normalizeContext(context);
  if (!normalized) return error('MALFORMED_CONTEXT');

  const served = decide(flag.targeting, normalized);
  if (!served) return error('MALFORMED_FLAG');
  const { variationIndex: index, reason } = served;
  if (!Number.isInteger(index) || index < 0 || index >= flag.variations.length) return error('MALFORMED_FLAG');
  return { value: flag.variations[index] as Variation, variationIndex: index, reason };
}

/** A variation index the targeting serves, with why. */
interface Served {
  variationIndex: number;
  reason: ServedReason;
}

/**
 * The index of the variation the targeting serves to the context, with why, or `null` when the targeting is
 * malformed. While targeting is on: individual targets first, then the ordered rules (first match wins), then the
 * default variation. The index itself is checked against the flag's variations by the caller.
 */
function decide(targeting: TargetingSnapshot, context: Context): Served | null {
  if (!targeting.on) return { variationIndex: targeting.offVariation, reason: { kind: 'OFF' } };

  const { individualTargets } = targeting;
  if (!Array.isArray(individualTargets)) return null;
  for (const target of individualTargets) {
    if (!isObject(target) || !isStringArray(target.userIds)) return null;
    if (context.user_id !== undefined && target.userIds.includes(context.user_id)) {
      return { variationIndex: target.variation, reason: { kind: 'TARGET_MATCH' } };
    }
  }

  const { rules } = targeting;
  if (!Array.isArray(rules)) return null;
  for (const [ruleIndex, rule] of rules.entries()) {
    const matched = matches(rule, context);
    if (matched === null) return null;
    if (matched) return { variationIndex: rule.variation, reason: { kind: 'RULE_MATCH', ruleIndex } };
  }

  return { variationIndex: targeting.defaultVariation, reason: { kind: 'DEFAULT' } };
}

/**
 * Whether the rule matches the context, or `null` when the rule is malformed. A context without the attribute the
 * rule tests never matches it, whichever the operator: `not in` only matches a value that is there.
 */
function matches(rule: Rule, context: Context): boolean | null {
  if (!isObject(rule) || !isStringArray(rule.values)) return null;
  if (!contextAttributeKeys.includes(rule.attribute) || !ruleOperators.includes(rule.operator)) return null;
  const value = context[rule.attribute];
  if (value === undefined) return false;
  // Core stores rule countries in uppercase, and the context's country has been uppercased.
  const listed = rule.values.includes(value);
  return rule.operator === 'in' ? listed : !listed;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * The context with absent (`undefined` or `null`) attributes left out and `country` in uppercase, or `null` when
 * it is malformed. Context attributes V1 doesn't know are ignored.
 */
function normalizeContext(context: unknown): Context | null {
  if (!isObject(context)) return null;
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
