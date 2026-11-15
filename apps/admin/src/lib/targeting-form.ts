import type { components } from '@ctff/core-api-client';
import type { FormSpec } from './form-errors.js';
import { textField } from './forms.js';
import {
  parseRuleEdit,
  ruleEditField,
  ruleFieldName,
  ruleIdOf,
  targetFieldName,
  targetVariationOf,
  type RuleField,
} from './targeting-fields.js';

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
  /** Added in the editor and not saved yet: while it has no values, it is left out rather than refused. */
  isNew: boolean;
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

/** Reads a submitted targeting editor: its rules in the order it lists them, after the rule button pressed, if any. */
export function readTargetingDraft(form: FormData): TargetingDraft {
  const ruleIds = new Set<string>();
  let variationCount = 0;
  for (const name of form.keys()) {
    const id = ruleIdOf(name);
    if (id !== undefined) ruleIds.add(id);
    const variation = targetVariationOf(name);
    if (variation !== undefined) variationCount = Math.max(variationCount, variation + 1);
  }
  const rules = [...ruleIds].flatMap((id): RuleDraft[] => {
    const field = (name: RuleField) => ruleFieldName(id, name);
    const rule: RuleDraft = {
      id,
      isNew: form.has(field('new')),
      attribute: textField(form, field('attribute')) === 'country' ? 'country' : 'user_id',
      operator: textField(form, field('operator')) === 'not_in' ? 'not_in' : 'in',
      userIds: textField(form, field('userIds')),
      countries: form.getAll(field('countries')).filter((value) => typeof value === 'string'),
      variation: variationIndex(form, field('variation')),
    };
    // A new rule without values is not a rule yet.
    return rule.isNew && ruleValues(rule).length === 0 ? [] : [rule];
  });
  return {
    offVariation: variationIndex(form, 'offVariation'),
    defaultVariation: variationIndex(form, 'defaultVariation'),
    targets: Array.from({ length: variationCount }, (_, variation) => textField(form, targetFieldName(variation))),
    rules: applyRuleEdit(rules, textField(form, ruleEditField)),
  };
}

/**
 * The rules after the rule button that sent the form, if any: up and down swap a rule with its neighbour (when it
 * has one), remove removes it. With scripts, the editor does this in the page instead.
 */
function applyRuleEdit(rules: RuleDraft[], value: string): RuleDraft[] {
  const edit = parseRuleEdit(value);
  const at = rules.findIndex((rule) => rule.id === edit?.id);
  if (edit === undefined || at === -1) return rules;
  if (edit.action === 'remove') return rules.filter((_, index) => index !== at);
  const other = edit.action === 'up' ? at - 1 : at + 1;
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
      isNew: false,
      attribute: rule.attribute,
      operator: rule.operator,
      userIds: rule.attribute === 'user_id' ? rule.values.join('\n') : '',
      countries: rule.attribute === 'country' ? [...rule.values] : [],
      variation: rule.variation,
    })),
  };
}

const ruleProperties = ['values', 'variation', 'attribute', 'operator'] as const;
const targetProperties = ['userIds', 'variation'] as const;

/** The properties of a targeting change the editor shows Core's messages next to (see {@link targetingDraftErrors}). */
export const targetingChangeForm: Pick<FormSpec, 'fields' | 'fieldPrefixes'> = {
  fields: ['offVariation', 'defaultVariation'],
  fieldPrefixes: ['individualTargets', 'rules'],
};

/** Core's messages about one rule, by the property they are about. */
export type RuleErrors = Partial<Record<(typeof ruleProperties)[number], string>>;

/** Core's messages about a draft's change, placed on the editor. */
export interface TargetingDraftErrors {
  offVariation: string | undefined;
  defaultVariation: string | undefined;
  /** By variation index. */
  targets: (string | undefined)[];
  /** By rule id. */
  rules: Partial<Record<string, RuleErrors>>;
}

/**
 * Places Core's messages about the change `draft` makes (keyed by the dotted path of the property they are about)
 * next to the editor's inputs: Core numbers individual targets and rules by their place in the change, the editor
 * by variation and by rule id.
 */
export function targetingDraftErrors(
  fields: Partial<Record<string, string>>,
  draft: TargetingDraft,
): TargetingDraftErrors {
  const targets: (string | undefined)[] = draft.targets.map(() => undefined);
  targetingChange(draft).individualTargets.forEach((target, index) => {
    targets[target.variation] = targetProperties
      .map((property) => fields[`individualTargets.${index}.${property}`])
      .find((message) => message !== undefined);
  });
  const rules: Partial<Record<string, RuleErrors>> = {};
  draft.rules.forEach((rule, index) => {
    const errors: RuleErrors = {};
    for (const property of ruleProperties) {
      const message = fields[`rules.${index}.${property}`];
      if (message !== undefined) errors[property] = message;
    }
    if (Object.keys(errors).length > 0) rules[rule.id] = errors;
  });
  return { offVariation: fields['offVariation'], defaultVariation: fields['defaultVariation'], targets, rules };
}
