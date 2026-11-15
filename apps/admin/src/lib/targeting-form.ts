import type { components } from '@ctff/core-api-client';
import { textField } from './forms.js';

type Targeting = components['schemas']['TargetingDto'];
type UpdateTargeting = components['schemas']['UpdateTargetingDto'];
type Rule = components['schemas']['RuleDto'];

/** The parts of targeting the editor sets; the targeting switch sets `on` on its own. */
export type TargetingChange = Required<
  Pick<UpdateTargeting, 'offVariation' | 'defaultVariation' | 'individualTargets' | 'rules'>
>;

/** A rule as the editor shows it: both its user IDs and its countries, so switching its attribute loses neither. */
export interface RuleDraft {
  /** Names the rule's inputs (`rule.{id}.*`). Not its position: the editor lists rules in order. */
  id: string;
  attribute: Rule['attribute'];
  operator: Rule['operator'];
  /** The user IDs as typed, one per line. */
  userIds: string;
  /** The ISO 3166-1 alpha-2 codes picked. */
  countries: string[];
  variation: number;
}

/** What the targeting editor shows: what was submitted, or the targeting as it is. */
export interface TargetingDraft {
  offVariation: number;
  defaultVariation: number;
  /** The user IDs of each variation's individual target as typed, one per line, by variation index. */
  targets: string[];
  /** In order: the first rule that matches wins. */
  rules: RuleDraft[];
}

/** The lines of a textarea, trimmed, without blank ones, each listed once. */
function lines(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((line) => line.trim()))].filter((line) => line !== '');
}

/** A variation index field: NaN unless a whole number, for Core to refuse. */
function variationIndex(form: FormData, name: string): number {
  const value = textField(form, name);
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

/** Reads a submitted targeting editor, for a flag with `variationCount` variations. */
export function readTargetingDraft(form: FormData, variationCount: number): TargetingDraft {
  const ruleIds = new Set<string>();
  for (const name of form.keys()) {
    const match = /^rule\.([^.]+)\./.exec(name);
    if (match?.[1] !== undefined) ruleIds.add(match[1]);
  }
  const rules = [...ruleIds].flatMap((id): RuleDraft[] => {
    const field = (name: string) => `rule.${id}.${name}`;
    const rule: RuleDraft = {
      id,
      attribute: textField(form, field('attribute')) === 'country' ? 'country' : 'user_id',
      operator: textField(form, field('operator')) === 'not_in' ? 'not_in' : 'in',
      userIds: textField(form, field('userIds')),
      countries: form.getAll(field('countries')).filter((value) => typeof value === 'string'),
      variation: variationIndex(form, field('variation')),
    };
    // The editor's blank rule, left blank, is not a rule.
    return form.has(field('new')) && ruleValues(rule).length === 0 ? [] : [rule];
  });
  return {
    offVariation: variationIndex(form, 'offVariation'),
    defaultVariation: variationIndex(form, 'defaultVariation'),
    targets: Array.from({ length: variationCount }, (_, variation) => textField(form, `target.${variation}`)),
    rules: applyRuleEdit(rules, textField(form, 'ruleEdit')),
  };
}

/**
 * The rules after the rule button that sent the form, if any: `up:{id}` and `down:{id}` swap a rule with its
 * neighbour (when it has one), `remove:{id}` removes it. With scripts, the editor does this in the page instead.
 */
function applyRuleEdit(rules: RuleDraft[], edit: string): RuleDraft[] {
  const [, action, id] = /^(up|down|remove):(.+)$/.exec(edit) ?? [];
  const at = rules.findIndex((rule) => rule.id === id);
  if (at === -1) return rules;
  if (action === 'remove') return rules.filter((_, index) => index !== at);
  const other = action === 'up' ? at - 1 : at + 1;
  const moving = rules[at];
  const neighbour = rules[other];
  if (moving === undefined || neighbour === undefined) return rules;
  const moved = [...rules];
  moved[other] = moving;
  moved[at] = neighbour;
  return moved;
}

/** The values a rule lists: its countries or its user IDs, as its attribute says. */
function ruleValues(rule: RuleDraft): string[] {
  return rule.attribute === 'country' ? [...new Set(rule.countries)] : lines(rule.userIds);
}

/** The change a draft makes, as Core takes it: individual targets only for variations given user IDs. */
export function targetingChange(draft: TargetingDraft): TargetingChange {
  return {
    offVariation: draft.offVariation,
    defaultVariation: draft.defaultVariation,
    individualTargets: draft.targets.flatMap((userIds, variation) => {
      const listed = lines(userIds);
      return listed.length === 0 ? [] : [{ variation, userIds: listed }];
    }),
    rules: draft.rules.map((rule) => ({
      attribute: rule.attribute,
      operator: rule.operator,
      values: ruleValues(rule),
      variation: rule.variation,
    })),
  };
}

/** The parts of a flag's targeting the editor opens with. */
export type EditableTargeting = Pick<Targeting, 'offVariation' | 'defaultVariation' | 'individualTargets' | 'rules'>;

/** What the editor shows of the targeting as it is, for a flag with `variationCount` variations. */
export function targetingDraft(targeting: EditableTargeting, variationCount: number): TargetingDraft {
  return {
    offVariation: targeting.offVariation,
    defaultVariation: targeting.defaultVariation,
    targets: Array.from({ length: variationCount }, (_, variation) =>
      (targeting.individualTargets.find((target) => target.variation === variation)?.userIds ?? []).join('\n'),
    ),
    rules: targeting.rules.map((rule, index) => ({
      id: String(index),
      attribute: rule.attribute,
      operator: rule.operator,
      userIds: rule.attribute === 'user_id' ? rule.values.join('\n') : '',
      countries: rule.attribute === 'country' ? [...rule.values] : [],
      variation: rule.variation,
    })),
  };
}

/** The most rules, and individual targets, a change may send Core (`maxItems` in Core's UpdateTargetingDto). */
const maxItems = 100;
const ruleProperties = ['values', 'variation', 'attribute', 'operator'] as const;
const targetProperties = ['userIds', 'variation'] as const;

/** The properties of a targeting change the editor shows Core's messages next to (see {@link targetingDraftErrors}). */
export const targetingChangeFields: readonly string[] = [
  'offVariation',
  'defaultVariation',
  ...Array.from({ length: maxItems }, (_, index) => [
    ...targetProperties.map((property) => `individualTargets.${index}.${property}`),
    ...ruleProperties.map((property) => `rules.${index}.${property}`),
  ]).flat(),
];

/** Core's messages about a draft's change, placed on the editor. */
export interface TargetingDraftErrors {
  offVariation: string | undefined;
  defaultVariation: string | undefined;
  /** By variation index. */
  targets: (string | undefined)[];
  /** By rule id. */
  rules: Partial<Record<string, string>>;
}

/**
 * Places Core's messages about the change `draft` makes (keyed by the property they are about, as
 * {@link targetingChangeFields} lists them) next to the editor's inputs: Core numbers individual targets and
 * rules by their place in the change, the editor by variation and by rule id.
 */
export function targetingDraftErrors(
  fields: Partial<Record<string, string>>,
  draft: TargetingDraft,
): TargetingDraftErrors {
  const first = (path: string, properties: readonly string[]) =>
    properties.map((property) => fields[`${path}.${property}`]).find((message) => message !== undefined);
  const targets: (string | undefined)[] = draft.targets.map(() => undefined);
  targetingChange(draft).individualTargets.forEach((target, index) => {
    targets[target.variation] = first(`individualTargets.${index}`, targetProperties);
  });
  const rules: Partial<Record<string, string>> = {};
  draft.rules.forEach((rule, index) => {
    const message = first(`rules.${index}`, ruleProperties);
    if (message !== undefined) rules[rule.id] = message;
  });
  return { offVariation: fields['offVariation'], defaultVariation: fields['defaultVariation'], targets, rules };
}
