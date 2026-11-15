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

/** How many seen contexts the Contexts explorer lists at first, and how many more each "Show more" adds. */
export const seenContextsStep = 100;
/** The most seen contexts Core lists at once (the API's `limit` bound), and the default seen-context cap. */
export const seenContextsMax = 1000;

/**
 * How many seen contexts to list, from the address's `shown` (absent: the first step): rounded up to a whole
 * step, at least one step and at most what Core lists at once.
 */
export function seenContextsShown(shown: string | null): number {
  const asked = Number(shown);
  if (!Number.isFinite(asked) || asked <= 0) return seenContextsStep;
  return Math.min(seenContextsMax, Math.ceil(asked / seenContextsStep) * seenContextsStep);
}

/**
 * How many to list for "Show more", or undefined when there are no more to show: fewer were listed than asked
 * for, or Core can't list more at once.
 */
export function moreSeenContexts(shown: number, listed: number): number | undefined {
  if (listed < shown || shown >= seenContextsMax) return undefined;
  return Math.min(seenContextsMax, shown + seenContextsStep);
}
