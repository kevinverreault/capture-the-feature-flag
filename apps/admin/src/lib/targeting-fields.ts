/**
 * The names of the targeting editor's inputs, in one place: its markup (TargetingEditor.astro, RuleFields.astro),
 * its script, and the mapper reading a submission (targeting-form.ts). It imports nothing, so the editor's script
 * can bundle it.
 */

/** The inputs of one rule. `new` marks a rule added in the editor, which isn't saved while it has no values. */
export type RuleField = 'attribute' | 'operator' | 'userIds' | 'countries' | 'variation' | 'new';

const ruleFieldPattern = /^rule\.([^.]+)\.(.+)$/;

/** The name of a rule's input: rules are named by an id of their own, not their place in the list. */
export function ruleFieldName(id: string, field: RuleField): string {
  return `rule.${id}.${field}`;
}

/** The id of the rule an input is part of, if it is a rule's. */
export function ruleIdOf(name: string): string | undefined {
  return ruleFieldPattern.exec(name)?.[1];
}

/** The same input of the rule with id `id`, for an input of a rule. */
export function renameRuleField(name: string, id: string): string {
  const match = ruleFieldPattern.exec(name);
  return match?.[2] === undefined ? name : `rule.${id}.${match[2]}`;
}

/** The name of the textarea listing the user IDs of a variation's individual target. */
export function targetFieldName(variation: number): string {
  return `target.${variation}`;
}

/** The variation whose individual target an input lists, if it is one. */
export function targetVariationOf(name: string): number | undefined {
  const match = /^target\.(\d+)$/.exec(name);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/** What a rule button does. */
export type RuleEditAction = 'up' | 'down' | 'remove';

export interface RuleEdit {
  action: RuleEditAction;
  /** The rule it does it to. */
  id: string;
}

/** The name of the rule buttons: the one pressed sends its value, as {@link ruleEditValue} builds it. */
export const ruleEditField = 'ruleEdit';

export function ruleEditValue({ action, id }: RuleEdit): string {
  return `${action}:${id}`;
}

/** The rule button a value is from, if any. */
export function parseRuleEdit(value: string): RuleEdit | undefined {
  const match = /^(up|down|remove):(.+)$/.exec(value);
  return match?.[1] === undefined || match[2] === undefined
    ? undefined
    : { action: match[1] as RuleEditAction, id: match[2] };
}
