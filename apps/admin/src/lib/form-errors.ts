import type { CoreApiError } from '@ctff/core-api-client';

/** What a form shows after a rejected submission: a message per field, and messages about the whole form. */
export interface FormErrors {
  fields: Partial<Record<string, string>>;
  form: string[];
}

export const noFormErrors: FormErrors = { fields: {}, form: [] };

/** The inputs a form sends Core, so Core's messages can be shown next to them. */
export interface FormSpec {
  /** The properties of the request body the form has inputs for. */
  fields: readonly string[];
  /** The input a 409 (a key already in use) is about, if any. */
  conflictField?: string;
}

/**
 * Turns Core's rejection of a form submission into messages to show on the form. A 400 names the property each
 * message is about, so each goes to its input when the form has one, and to the whole form otherwise. A 409 goes
 * to `conflictField` when given; any other error to the whole form.
 */
export function formErrors(error: CoreApiError, { fields, conflictField }: FormSpec): FormErrors {
  if (error.status === 409 && conflictField !== undefined) {
    return { fields: { [conflictField]: error.messages[0] }, form: error.messages.slice(1) };
  }
  if (error.status !== 400) return { fields: {}, form: [...error.messages] };

  const result: FormErrors = { fields: {}, form: [] };
  const placed = new Set<string>();
  for (const field of fields) {
    const [first] = error.fields[field] ?? [];
    if (first === undefined) continue;
    result.fields[field] = first;
    for (const message of error.fields[field] ?? []) placed.add(message);
  }
  result.form = error.messages.filter((message) => !placed.has(message));
  return result;
}
