import { CoreApiError } from '@ctff/core-api-client';

/** What a form shows after a rejected submission: a message per field, and messages about the whole form. */
export interface FormErrors {
  fields: Partial<Record<string, string>>;
  form: string[];
}

export const noFormErrors: FormErrors = { fields: {}, form: [] };

/**
 * Turns Core's answer to a form submission into messages to show on the form. Core's validation messages start
 * with the property they are about, optionally after what it belongs to ("name must not be blank", "project key
 * must be lowercase kebab-case"), so each goes to the listed field it names, and the rest to the whole form. A
 * 409 (a key in use) goes to `conflictField` when given. Anything other than an error response from Core is
 * rethrown: it is not something the admin can fix in the form.
 */
export function formErrors(
  error: unknown,
  fields: readonly string[],
  { conflictField }: { conflictField?: string } = {},
): FormErrors {
  if (!(error instanceof CoreApiError)) throw error;

  const result: FormErrors = { fields: {}, form: [] };
  for (const message of error.messages) {
    const field =
      error.status === 400 ? fieldNamedBy(message, fields) : error.status === 409 ? conflictField : undefined;
    if (field === undefined) result.form.push(message);
    else result.fields[field] ??= message;
  }
  return result;
}

function fieldNamedBy(message: string, fields: readonly string[]): string | undefined {
  const [first, second, third] = message.split(/\s+/);
  // "name must …" or "project key must …": the field, then what the message says about it.
  return fields.find((field) => (first === field && second !== undefined) || (second === field && third === 'must'));
}
