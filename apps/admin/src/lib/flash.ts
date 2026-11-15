import type { AstroCookies } from 'astro';

const cookie = 'ctff-flash';

/** Keeps a confirmation ("Project created") for the page the browser is redirected to next. */
export function setFlash(cookies: AstroCookies, message: string): void {
  cookies.set(cookie, message, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 });
}

/** Reads the confirmation left by the previous request, if any, and clears it so it shows once. */
export function takeFlash(cookies: AstroCookies): string | undefined {
  const message = cookies.get(cookie)?.value;
  if (message !== undefined) cookies.delete(cookie, { path: '/' });
  return message || undefined;
}
