import { isCountryCode } from './countries.js';
import type { ContextAttributeKey } from './snapshot.js';

/**
 * What each context attribute allows, in one place: in a context being evaluated, and in the values of a rule on
 * it (and, for `user_id`, of an individual target). Values are compared as `normalize` returns them.
 */
export interface ContextAttributeType {
  /** Whether a context may carry the value. A context with any other value is malformed. */
  accepts(value: string): boolean;
  /**
   * Why a rule may not list the value, or `null` when it may. Stricter than `accepts` for `country`: a context
   * may carry any two-letter code, but a rule may only list assigned ISO 3166-1 alpha-2 codes.
   */
  ruleValueProblem(value: string): string | null;
  /** The value as stored in rules and compared: country codes in uppercase. */
  normalize(value: string): string;
}

export const contextAttributes: Record<ContextAttributeKey, ContextAttributeType> = {
  user_id: {
    accepts: (value) => value !== '',
    ruleValueProblem: (value) => (value === '' ? 'user IDs must be non-empty strings' : null),
    normalize: (value) => value,
  },
  country: {
    accepts: (value) => /^[A-Za-z]{2}$/.test(value),
    ruleValueProblem: (value) => (isCountryCode(value) ? null : `${value} is not an ISO 3166-1 alpha-2 country code`),
    normalize: (value) => value.toUpperCase(),
  },
};
