import type { AstroCookies } from 'astro';

const cookie = 'ctff-display-name';
export const displayNameMaxLength = 200;

/**
 * The admin's display name, kept in a cookie by this browser. The admin app sends it to Core as the actor of every
 * change (X-CTFF-Actor), so the audit log attributes changes to it. There are no accounts: anyone can set any name.
 */
export function displayName(cookies: AstroCookies): string | undefined {
  const name = cookies.get(cookie)?.value.trim();
  return name ? name : undefined;
}

/** Keeps the display name for a year; an empty name clears it, and changes are then made as `anonymous`. */
export function setDisplayName(cookies: AstroCookies, name: string): void {
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, displayNameMaxLength);
  if (trimmed === '') cookies.delete(cookie, { path: '/' });
  else cookies.set(cookie, trimmed, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
}

/** Where to go back to after setting the display name: a path of the admin app only, never another site. */
export function returnPath(value: string | null | undefined, fallback: string): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : fallback;
}
