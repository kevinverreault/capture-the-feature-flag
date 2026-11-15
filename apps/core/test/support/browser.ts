import { parse, type HTMLElement } from 'node-html-parser';

/** The admin app, as a browser sees it on Core's origin (ADR 0003). */
export function browser(baseUrl: string) {
  return {
    /** Gets a page, sending the `cookie` header given, if any. */
    get: (path: string, cookie?: string) =>
      fetch(`${baseUrl}${path}`, { redirect: 'manual', headers: cookie ? { cookie } : {} }),
    /** Submits a form the way a browser does: urlencoded, from a page of the same origin. */
    post: (path: string, fields: Record<string, string>, cookie?: string) =>
      fetch(`${baseUrl}${path}`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: baseUrl,
          ...(cookie ? { cookie } : {}),
        },
        body: new URLSearchParams(fields).toString(),
      }),
  };
}

export type Browser = ReturnType<typeof browser>;

/** Parses a page of the admin app, to query it like the DOM. */
export async function page(response: Response): Promise<HTMLElement> {
  return parse(await response.text());
}

/**
 * The cookies a response sets, as the `cookie` header a browser would send back: without the flash message, and
 * without the cookies it deletes (expired, or with a max-age of 0).
 */
export function cookiesSet(response: Response): string {
  return response.headers
    .getSetCookie()
    .filter((cookie) => !isDeletion(cookie))
    .map((cookie) => cookie.split(';')[0] ?? '')
    .filter((cookie) => !cookie.startsWith('ctff-flash='))
    .join('; ');
}

function isDeletion(cookie: string): boolean {
  const attributes = cookie
    .split(';')
    .slice(1)
    .map((attribute) => attribute.trim().toLowerCase());
  return attributes.some(
    (attribute) =>
      attribute === 'max-age=0' ||
      (attribute.startsWith('expires=') && Date.parse(attribute.slice('expires='.length)) <= Date.now()),
  );
}
