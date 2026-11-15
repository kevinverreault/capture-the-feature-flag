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

/**
 * Like `postedForm`, but reads at most `maxBytes` of the body: `'too-large'` when its Content-Length says more, or
 * once more than that has streamed in (a chunked upload has no Content-Length), so a large upload is never held in
 * memory whole.
 */
export async function postedFormWithin(request: Request, maxBytes: number): Promise<FormData | 'too-large'> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return 'too-large';
  if (!request.body) return new FormData();
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return 'too-large';
    }
    chunks.push(value);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const contentType = request.headers.get('content-type') ?? '';
  return postedForm(new Request(request.url, { method: 'POST', body, headers: { 'content-type': contentType } }));
}

/** A text field of a form, or `''` when it is missing (or a file). */
export function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
