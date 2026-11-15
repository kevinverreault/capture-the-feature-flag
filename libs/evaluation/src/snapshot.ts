/**
 * The targeting snapshot of one environment, as Core serves it to Evaluators (ADR 0001). Core produces it, the
 * Evaluator evaluates from it, and test fakes of Core build it, so all of them share this one definition.
 */

/** One possible value of a flag. V1 flags are boolean and always have the variations `[true, false]` (ADR 0002). */
export type Variation = boolean;

/** The context attributes a rule can test. Both are built in: `user_id` and `country`. */
export const contextAttributeKeys = ['user_id', 'country'] as const;
export type ContextAttributeKey = (typeof contextAttributeKeys)[number];

/** The rule operators: `in` and `not in` (spelled `not_in` on the wire). */
export const ruleOperators = ['in', 'not_in'] as const;
export type RuleOperator = (typeof ruleOperators)[number];

/** A list of user IDs that are always served one variation while targeting is on. */
export interface IndividualTarget {
  /** Index into the flag's `variations`. */
  variation: number;
  userIds: string[];
}

/** An ordered condition on a context attribute that serves a variation when it matches. The first match wins. */
export interface Rule {
  attribute: ContextAttributeKey;
  operator: RuleOperator;
  values: string[];
  /** Index into the flag's `variations`. */
  variation: number;
}

/** The targeting of one flag in one environment. Variations are referred to by index. */
export interface TargetingSnapshot {
  on: boolean;
  offVariation: number;
  defaultVariation: number;
  individualTargets: IndividualTarget[];
  rules: Rule[];
  version: number;
}

export interface FlagSnapshot {
  key: string;
  variations: Variation[];
  version: number;
  targeting: TargetingSnapshot;
}

export interface EnvironmentSnapshot {
  projectKey: string;
  environmentKey: string;
  /** Every flag of the project that is not archived, with its targeting in this environment, ordered by flag key. */
  flags: FlagSnapshot[];
}
