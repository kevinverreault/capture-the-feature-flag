import type { AstroCookies } from 'astro';

const cookie = 'birdwatch-session';

/** The session token of the birder this browser is logged in as (a JWT from birdwatch-api), if any. */
export function sessionToken(cookies: AstroCookies): string | undefined {
  return cookies.get(cookie)?.value || undefined;
}

export function startSession(cookies: AstroCookies, token: string, maxAgeSeconds: number): void {
  cookies.set(cookie, token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: maxAgeSeconds });
}

export function endSession(cookies: AstroCookies): void {
  cookies.delete(cookie, { path: '/' });
}
