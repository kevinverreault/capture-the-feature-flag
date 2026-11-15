import { parse, type HTMLElement } from 'node-html-parser';

/** The admin app, as a browser sees it on Core's origin (ADR 0003). */
export function browser(baseUrl: string) {
  return {
    get: (path: string) => fetch(`${baseUrl}${path}`, { redirect: 'manual' }),
    /** Submits a form the way a browser does: urlencoded, from a page of the same origin. */
    post: (path: string, fields: Record<string, string> | [string, string][]) =>
      fetch(`${baseUrl}${path}`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', origin: baseUrl },
        body: new URLSearchParams(fields).toString(),
      }),
  };
}

export type Browser = ReturnType<typeof browser>;

/** Parses a page of the admin app, to query it like the DOM. */
export async function page(response: Response): Promise<HTMLElement> {
  return parse(await response.text());
}
