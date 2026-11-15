import { contextAttributes, type TargetingSnapshot } from '@ctff/evaluation';
import type { FieldMessages } from '../common/validation.js';

/** The parts of targeting a change sets, other than `on`; parts left out keep their stored value. */
export type TargetingChange = Partial<
  Pick<TargetingSnapshot, 'offVariation' | 'defaultVariation' | 'individualTargets' | 'rules'>
>;

export type CheckedTargetingChange = { valid: true; change: TargetingChange } | { valid: false; fields: FieldMessages };

/**
 * Checks the parts a change sends (their shape is validated by the request DTO) against what the request DTO
 * can't see: the flag's variations, the values each context attribute allows, and clashes between individual
 * targets. Each part is valid or not on its own, so the parts left out are not checked again: a change that only
 * switches targeting on or off always goes through. A valid change comes back normalized for storage: country
 * codes in uppercase, and repeated values listed once. Messages are keyed by the dotted path of the property they
 * are about, like the ValidationPipe's.
 */
export function checkTargetingChange(change: TargetingChange, variationCount: number): CheckedTargetingChange {
  const fields: FieldMessages = {};
  const fail = (path: string, message: string) => void (fields[path] ??= []).push(message);
  const checkVariation = (path: string, index: number | undefined) => {
    if (index !== undefined && index >= variationCount) {
      fail(path, `variation ${index} does not exist; the flag has variations 0 to ${variationCount - 1}`);
    }
  };
  /** The values, normalized and listed once, failing `path` for each the attribute doesn't allow in a rule. */
  const checkValues = (path: string, attribute: keyof typeof contextAttributes, values: string[]) => {
    const type = contextAttributes[attribute];
    const problems = new Set(values.map((value) => type.ruleValueProblem(value)).filter((problem) => problem !== null));
    for (const problem of problems) fail(path, problem);
    return unique(values.map((value) => type.normalize(value)));
  };

  checkVariation('offVariation', change.offVariation);
  checkVariation('defaultVariation', change.defaultVariation);

  const variationOfUserId = new Map<string, number>();
  const targetedVariations = new Set<number>();
  const individualTargets = change.individualTargets?.map((target, index) => {
    const path = `individualTargets.${index}`;
    checkVariation(`${path}.variation`, target.variation);
    if (targetedVariations.has(target.variation)) {
      fail(`${path}.variation`, `variation ${target.variation} already has an individual target`);
    }
    targetedVariations.add(target.variation);
    const userIds = checkValues(`${path}.userIds`, 'user_id', target.userIds);
    for (const userId of userIds) {
      const other = variationOfUserId.get(userId);
      if (other !== undefined && other !== target.variation) {
        fail(`${path}.userIds`, `${userId} is already in the individual target of variation ${other}`);
      }
      variationOfUserId.set(userId, target.variation);
    }
    return { variation: target.variation, userIds };
  });

  const rules = change.rules?.map((rule, index) => {
    const path = `rules.${index}`;
    checkVariation(`${path}.variation`, rule.variation);
    const values = checkValues(`${path}.values`, rule.attribute, rule.values);
    return { attribute: rule.attribute, operator: rule.operator, values, variation: rule.variation };
  });

  if (Object.keys(fields).length > 0) return { valid: false, fields };
  return {
    valid: true,
    change: {
      offVariation: change.offVariation,
      defaultVariation: change.defaultVariation,
      individualTargets,
      rules,
    },
  };
}

/** The values in their first-seen order, each listed once. */
function unique(values: string[]): string[] {
  return [...new Set(values)];
}
