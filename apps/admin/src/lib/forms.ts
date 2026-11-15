import { CoreApiError } from '@ctff/core-api-client';
import type { AstroGlobal } from 'astro';
import { setFlash } from './flash.js';
import { type FormErrors, formErrors, type FormSpec, noFormErrors } from './form-errors.js';

/** A text field of a submitted form, trimmed; an absent field reads as empty. */
export function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** One thing a page's forms can do, such as rename or delete: what it sends Core, and where to go afterwards. */
export interface FormAction extends FormSpec {
  /** Sends the submission to Core; resolves to the page to go to next and the confirmation to show there. */
  send(form: FormData): Promise<{ location: string; flash: string }>;
}

export interface PostResult {
  /** The action the submission asked for, so a page with several forms shows the errors on the right one. */
  action?: string;
  /** The 303 to return when the submission succeeded (Post/Redirect/Get). */
  redirect?: Response;
  /** What to show on the form when Core rejected the submission. */
  errors: FormErrors;
  /** A submitted field, to keep what was typed; undefined when there was no submission or no such field. */
  value(name: string): string | undefined;
  /** The whole submission, for a form with repeated fields (such as a multi-select); undefined when there was none. */
  form?: FormData;
}

/**
 * Handles a form post to the page: runs the action named by the form's `_action` field (or the page's only
 * action), then redirects with its confirmation. When Core rejects it, the page answers with Core's status and
 * the form shows Core's messages (see {@link formErrors}). Anything other than an error response from Core is
 * rethrown: the admin can't fix it in the form.
 */
export async function handlePost(astro: AstroGlobal, actions: Record<string, FormAction>): Promise<PostResult> {
  if (astro.request.method !== 'POST') return { errors: noFormErrors, value: () => undefined };

  const form = await astro.request.formData();
  const value = (name: string) => (form.has(name) ? textField(form, name) : undefined);
  const names = Object.keys(actions);
  const name = textField(form, '_action') || (names.length === 1 ? names[0] : undefined);
  const action = name === undefined ? undefined : actions[name];
  if (!action) {
    astro.response.status = 400;
    return { action: name, errors: { fields: {}, form: [`This form can't do "${name ?? ''}"`] }, value, form };
  }

  try {
    const { location, flash } = await action.send(form);
    setFlash(astro.cookies, flash);
    return { action: name, redirect: astro.redirect(location, 303), errors: noFormErrors, value, form };
  } catch (error) {
    if (!(error instanceof CoreApiError)) throw error;
    astro.response.status = error.status;
    return { action: name, errors: formErrors(error, action), value, form };
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
