import { contextAttributes } from './context-attributes.js';
import {
  type ContextAttributeKey,
  contextAttributeKeys,
  type EnvironmentSnapshot,
  type FlagSnapshot,
  type Rule,
  type RuleOperator,
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

/** The kinds of evaluation reason, as `EvaluationReason` names them. */
export const evaluationReasonKinds = [
  'OFF',
  'TARGET_MATCH',
  'RULE_MATCH',
  'DEFAULT',
  'FLAG_NOT_FOUND',
  'ERROR',
] as const satisfies readonly EvaluationReason['kind'][];

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

  if (!isWellFormed(flag)) return error('MALFORMED_FLAG');
  const { variationIndex, reason } = decide(flag.targeting, normalized);
  return { value: flag.variations[variationIndex] as Variation, variationIndex, reason };
}

/** A variation index the targeting serves, with why. */
interface Served {
  variationIndex: number;
  reason: ServedReason;
}

/**
 * The index of the variation well-formed targeting serves to the context, with why. While targeting is on:
 * individual targets first, then the ordered rules (first match wins), then the default variation.
 */
function decide(targeting: TargetingSnapshot, context: Context): Served {
  if (!targeting.on) return { variationIndex: targeting.offVariation, reason: { kind: 'OFF' } };

  const userId = context.user_id;
  const target =
    userId === undefined ? undefined : targeting.individualTargets.find(({ userIds }) => userIds.includes(userId));
  if (target) return { variationIndex: target.variation, reason: { kind: 'TARGET_MATCH' } };

  const ruleIndex = targeting.rules.findIndex((rule) => matches(rule, context));
  if (ruleIndex >= 0) {
    const rule = targeting.rules[ruleIndex] as Rule;
    return { variationIndex: rule.variation, reason: { kind: 'RULE_MATCH', ruleIndex } };
  }

  return { variationIndex: targeting.defaultVariation, reason: { kind: 'DEFAULT' } };
}

/**
 * Whether the rule matches the (normalized) context. A context without the attribute the rule tests never matches
 * it, whichever the operator: `not in` only matches a value that is there.
 */
function matches(rule: Rule, context: Context): boolean {
  const value = context[rule.attribute];
  if (value === undefined) return false;
  const { normalize } = contextAttributes[rule.attribute];
  const listed = rule.values.some((candidate) => normalize(candidate) === value);
  return rule.operator === 'in' ? listed : !listed;
}

/**
 * Whether the flag's targeting is well-formed as a whole, whatever the context: every part of it has the right
 * shape and refers to a variation the flag has. Checking it all, not just the part an evaluation reaches, means
 * malformed targeting is an error for every context alike. Snapshots are replaced, never changed, so the answer
 * is kept per flag object.
 */
function isWellFormed(flag: FlagSnapshot): boolean {
  let wellFormed = wellFormedFlags.get(flag);
  if (wellFormed === undefined) {
    wellFormed = checkWellFormed(flag);
    wellFormedFlags.set(flag, wellFormed);
  }
  return wellFormed;
}

const wellFormedFlags = new WeakMap<FlagSnapshot, boolean>();

function checkWellFormed({ variations, targeting }: FlagSnapshot): boolean {
  if (!Array.isArray(variations) || !isObject(targeting) || typeof targeting.on !== 'boolean') return false;
  const isVariation = (index: unknown) =>
    Number.isInteger(index) && (index as number) >= 0 && (index as number) < variations.length;
  const { offVariation, defaultVariation, individualTargets, rules } = targeting;
  return (
    isVariation(offVariation) &&
    isVariation(defaultVariation) &&
    Array.isArray(individualTargets) &&
    individualTargets.every(
      (target: unknown) => isObject(target) && isVariation(target.variation) && isStringArray(target.userIds),
    ) &&
    Array.isArray(rules) &&
    rules.every(
      (rule: unknown) =>
        isObject(rule) &&
        contextAttributeKeys.includes(rule.attribute as ContextAttributeKey) &&
        ruleOperators.includes(rule.operator as RuleOperator) &&
        isStringArray(rule.values) &&
        isVariation(rule.variation),
    )
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * The context with absent (`undefined` or `null`) attributes left out and `country` in uppercase, or `null` when
 * it is malformed. Context attributes V1 doesn't know are ignored. `evaluate()` checks contexts with it, and the
 * Evaluator and Core use it to record seen contexts the same way.
 */
export function normalizeContext(context: unknown): Context | null {
  if (!isObject(context)) return null;
  const normalized: Context = {};
  for (const key of contextAttributeKeys) {
    const value = context[key];
    if (value === undefined || value === null) continue;
    const attribute = contextAttributes[key];
    if (typeof value !== 'string' || !attribute.accepts(value)) return null;
    normalized[key] = attribute.normalize(value);
  }
  return normalized;
}
