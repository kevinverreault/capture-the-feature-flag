import { describe, expect, it } from 'vitest';
import { postedFormWithin } from '../src/lib/forms';

function upload(bytes: number, headers: Record<string, string> = {}): Request {
  const form = new FormData();
  form.set('photo', new File([new Uint8Array(bytes)], 'bird.jpg', { type: 'image/jpeg' }));
  return new Request('http://birdwatch.test/photo-id', { method: 'POST', body: form, headers });
}

/** A request whose body streams in without a Content-Length, as a chunked upload does. */
function chunked(bytes: number): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let sent = 0; sent < bytes; sent += 1024) controller.enqueue(new Uint8Array(Math.min(1024, bytes - sent)));
      controller.close();
    },
  });
  return new Request('http://birdwatch.test/photo-id', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/octet-stream' },
    duplex: 'half',
  } as RequestInit);
}

describe('postedFormWithin', () => {
  it('reads a form within the limit', async () => {
    const form = await postedFormWithin(upload(1000), 10_000);
    expect(form).not.toBe('too-large');
    expect(((form as FormData).get('photo') as File).size).toBe(1000);
  });

  it('refuses a body whose Content-Length is over the limit, without reading it', async () => {
    const request = upload(100, { 'content-length': '20000' });
    expect(await postedFormWithin(request, 10_000)).toBe('too-large');
    expect(request.bodyUsed).toBe(false);
  });

  it('refuses a body that streams in past the limit without a Content-Length', async () => {
    expect(await postedFormWithin(chunked(50_000), 10_000)).toBe('too-large');
  });

  it('answers as for an empty form when the body is not a form', async () => {
    const form = await postedFormWithin(chunked(10), 10_000);
    expect([...(form as FormData).keys()]).toEqual([]);
  });
});
