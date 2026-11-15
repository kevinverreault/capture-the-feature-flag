/**
 * The fields of a posted form, or none when the body isn't a form (a post by hand with another content type), so
 * the page answers as for an empty form instead of failing.
 */
export async function postedForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}

/** A text field of a form, or `''` when it is missing (or a file). */
export function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
