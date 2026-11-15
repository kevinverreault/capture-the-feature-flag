import type { CoreApiError } from '@ctff/core-api-client';

/** What a form shows after a rejected submission: a message per field, and messages about the whole form. */
export interface FormErrors {
  fields: Partial<Record<string, string>>;
  form: string[];
  /**
   * Set when the change was based on a version someone else has changed since (Core's 409 on a versioned
   * update): the page asks the admin to reload instead of overwriting, and keeps what they typed.
   */
  changedElsewhere?: true;
}

export const noFormErrors: FormErrors = { fields: {}, form: [] };

/** The inputs a form sends Core, so Core's messages can be shown next to them. */
export interface FormSpec {
  /** The properties of the request body the form has inputs for. */
  fields: readonly string[];
  /**
   * Properties whose nested properties the form has inputs for, such as `rules` for `rules.0.values`: a message
   * about one goes to it (by its dotted path) rather than to the whole form.
   */
  fieldPrefixes?: readonly string[];
  /** The input a 409 (a key already in use) is about, if any. */
  conflictField?: string;
  /** Whether the form sends the version its change is based on, so that a 409 means it changed elsewhere. */
  versioned?: boolean;
}

/**
 * Turns Core's rejection of a form submission into messages to show on the form. A 400 names the property each
 * message is about, so each goes to its input when the form has one (among `fields`, or under `fieldPrefixes`),
 * and to the whole form otherwise. A 409 goes to `conflictField` when given, or, for a `versioned` form, reports a
 * change made elsewhere; any other error goes to the whole form.
 */
export function formErrors(
  error: CoreApiError,
  { fields, fieldPrefixes = [], conflictField, versioned }: FormSpec,
): FormErrors {
  if (error.status === 409 && versioned) return { fields: {}, form: [], changedElsewhere: true };
  if (error.status === 409 && conflictField !== undefined) {
    return { fields: { [conflictField]: error.messages[0] }, form: error.messages.slice(1) };
  }
  if (error.status !== 400) return { fields: {}, form: [...error.messages] };

  const result: FormErrors = { fields: {}, form: [] };
  const placed = new Set<string>();
  const nested = Object.keys(error.fields).filter((field) =>
    fieldPrefixes.some((prefix) => field.startsWith(`${prefix}.`)),
  );
  for (const field of [...fields, ...nested]) {
    const [first] = error.fields[field] ?? [];
    if (first === undefined) continue;
    result.fields[field] = first;
    for (const message of error.fields[field] ?? []) placed.add(message);
  }
  result.form = error.messages.filter((message) => !placed.has(message));
  return result;
}
