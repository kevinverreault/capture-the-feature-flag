import type { Context, EvaluationReason } from '@ctff/core-api-client';

const errorTexts: Record<NonNullable<EvaluationReason['errorKind']>, string> = {
  MALFORMED_FLAG: 'the targeting refers to a variation the flag does not have',
  MALFORMED_CONTEXT: 'the context is malformed',
};

/** Why an evaluation produced its variation, as the Contexts explorer says it. */
export function evaluationReasonText(reason: EvaluationReason): string {
  switch (reason.kind) {
    case 'OFF':
      return 'Targeting off';
    case 'TARGET_MATCH':
      return 'Individual target';
    case 'RULE_MATCH':
      // Numbered from 1, as rules are listed.
      return reason.ruleIndex === undefined ? 'Rule matched' : `Rule ${reason.ruleIndex + 1} matched`;
    case 'DEFAULT':
      return 'Default variation';
    case 'FLAG_NOT_FOUND':
      return 'Flag not found';
    case 'ERROR':
      return reason.errorKind === undefined ? 'Error' : `Error: ${errorTexts[reason.errorKind]}`;
  }
}

/**
 * The context the Contexts explorer's address selects, by its attributes (`user_id`, `country`), or undefined when
 * it names none. Blank attributes are left out; Core checks the rest.
 */
export function contextFromQuery(query: URLSearchParams): Context | undefined {
  const userId = query.get('user_id') ?? '';
  const country = query.get('country') ?? '';
  if (userId === '' && country === '') return undefined;
  return { ...(userId === '' ? {} : { user_id: userId }), ...(country === '' ? {} : { country }) };
}

/** A context named by its attributes, such as "alice in CA". */
export function contextLabel(context: Context): string {
  const { user_id: userId, country } = context;
  if (userId !== undefined) return country === undefined ? userId : `${userId} in ${country}`;
  return country === undefined ? 'An empty context' : `Someone in ${country}`;
}

/** Whether two contexts have the same attributes; countries are compared ignoring case, as evaluations do. */
export function sameContext(a: Context, b: Context | undefined): boolean {
  return b !== undefined && a.user_id === b.user_id && a.country?.toUpperCase() === b.country?.toUpperCase();
}
