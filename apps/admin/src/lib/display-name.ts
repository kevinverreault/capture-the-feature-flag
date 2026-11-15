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

/**
 * The display name as kept: runs of whitespace as one space, trimmed, at most {@link displayNameMaxLength}
 * characters. Empty means no display name.
 */
export function normalizeDisplayName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, displayNameMaxLength).trim();
}

/**
 * Keeps the display name for a year, and returns it as kept (see {@link normalizeDisplayName}); an empty name
 * clears it, and changes are then made as `anonymous`.
 */
export function setDisplayName(cookies: AstroCookies, name: string): string {
  const kept = normalizeDisplayName(name);
  if (kept === '') cookies.delete(cookie, { path: '/' });
  else cookies.set(cookie, kept, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  return kept;
}

/** Where to go back to after setting the display name: a path of the admin app only, never another site. */
export function returnPath(value: string | null | undefined, fallback: string): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : fallback;
}
