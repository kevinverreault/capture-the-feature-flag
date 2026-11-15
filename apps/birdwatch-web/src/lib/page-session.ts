import type { AstroGlobal } from 'astro';
import { birdwatchApi, SessionExpired } from './api';
import { endSession, sessionToken } from './session';

/**
 * Loads what a page needs as the logged-in birder, or answers with a redirect to the login page when this browser
 * isn't logged in or its session expired.
 */
export async function asBirder<T>(
  astro: AstroGlobal,
  load: (api: ReturnType<typeof birdwatchApi>) => Promise<T>,
): Promise<{ loaded: T } | { redirect: Response }> {
  const token = sessionToken(astro.cookies);
  if (!token) return { redirect: astro.redirect('/login', 303) };
  try {
    return { loaded: await load(birdwatchApi(astro.locals, token)) };
  } catch (error) {
    if (!(error instanceof SessionExpired)) throw error;
    endSession(astro.cookies);
    return { redirect: astro.redirect('/login', 303) };
  }
}
