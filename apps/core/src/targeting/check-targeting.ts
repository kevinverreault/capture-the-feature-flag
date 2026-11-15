import { isCountryCode, type TargetingSnapshot } from '@ctff/evaluation';
import type { FieldMessages } from '../common/validation.js';

/** The parts of targeting a change can set, as they would be stored. */
export type TargetingSettings = Pick<
  TargetingSnapshot,
  'offVariation' | 'defaultVariation' | 'individualTargets' | 'rules'
>;

export type CheckedTargeting = { valid: true; targeting: TargetingSettings } | { valid: false; fields: FieldMessages };

/**
 * Checks well-formed targeting (its shape is validated by the request DTO) against what the request DTO can't
 * see: the flag's variations, the values each rule attribute allows, and clashes between individual targets.
 * Valid targeting comes back normalized for storage: country codes in uppercase, and repeated values listed once.
 * Messages are keyed by the dotted path of the property they are about, like the ValidationPipe's.
 */
export function checkTargeting(targeting: TargetingSettings, variationCount: number): CheckedTargeting {
  const fields: FieldMessages = {};
  const fail = (path: string, message: string) => void (fields[path] ??= []).push(message);
  const checkVariation = (path: string, index: number) => {
    if (index >= variationCount) {
      fail(path, `variation ${index} does not exist; the flag has variations 0 to ${variationCount - 1}`);
    }
  };

  checkVariation('offVariation', targeting.offVariation);
  checkVariation('defaultVariation', targeting.defaultVariation);

  const variationOfUserId = new Map<string, number>();
  const targetedVariations = new Set<number>();
  const individualTargets = targeting.individualTargets.map((target, index) => {
    const path = `individualTargets.${index}`;
    checkVariation(`${path}.variation`, target.variation);
    if (targetedVariations.has(target.variation)) {
      fail(`${path}.variation`, `variation ${target.variation} already has an individual target`);
    }
    targetedVariations.add(target.variation);
    const userIds = unique(target.userIds);
    for (const userId of userIds) {
      const other = variationOfUserId.get(userId);
      if (other !== undefined && other !== target.variation) {
        fail(`${path}.userIds`, `${userId} is already in the individual target of variation ${other}`);
      }
      variationOfUserId.set(userId, target.variation);
    }
    return { variation: target.variation, userIds };
  });

  const rules = targeting.rules.map((rule, index) => {
    const path = `rules.${index}`;
    checkVariation(`${path}.variation`, rule.variation);
    let values = unique(rule.values);
    if (rule.attribute === 'country') {
      for (const value of values.filter((candidate) => !isCountryCode(candidate))) {
        fail(`${path}.values`, `${value} is not an ISO 3166-1 alpha-2 country code`);
      }
      values = unique(values.map((value) => value.toUpperCase()));
    } else if (values.includes('')) {
      fail(`${path}.values`, 'user IDs must be non-empty strings');
    }
    return { attribute: rule.attribute, operator: rule.operator, values, variation: rule.variation };
  });

  if (Object.keys(fields).length > 0) return { valid: false, fields };
  return {
    valid: true,
    targeting: {
      offVariation: targeting.offVariation,
      defaultVariation: targeting.defaultVariation,
      individualTargets,
      rules,
    },
  };
}

/** The values in their first-seen order, each listed once. */
function unique(values: string[]): string[] {
  return [...new Set(values)];
}
