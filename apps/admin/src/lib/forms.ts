import { CoreApiError } from '@ctff/core-api-client';
import { type FormErrors, formErrors } from './form-errors.js';

/** A text field of a submitted form, trimmed; an absent field reads as empty. */
export function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export type Submission<T> = { ok: true; value: T } | { ok: false; status: number; errors: FormErrors };

/**
 * Sends a form's submission to Core. When Core rejects it, the result carries Core's status (for the re-rendered
 * page) and its messages placed on the form's fields; see {@link formErrors}.
 */
export async function submit<T>(
  send: () => Promise<T>,
  fields: readonly string[],
  options: { conflictField?: string } = {},
): Promise<Submission<T>> {
  try {
    return { ok: true, value: await send() };
  } catch (error) {
    const errors = formErrors(error, fields, options);
    return { ok: false, status: (error as CoreApiError).status, errors };
  }
}

/** Resolves to undefined when Core answers 404, so a page can render its own "not found". */
export async function orNotFound<T>(request: Promise<T>): Promise<T | undefined> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof CoreApiError && error.status === 404) return undefined;
    throw error;
  }
}
