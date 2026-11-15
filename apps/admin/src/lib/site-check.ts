const reads = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Whether a request that changes something carries neither `Origin` nor `Sec-Fetch-Site`. Astro's origin check
 * only judges requests that have one of them, so a forged form post without both would get through it. Browsers
 * send `Origin` with every form post, so refusing these costs the admin app nothing.
 */
export function isUnverifiablePost(request: Request): boolean {
  if (reads.has(request.method)) return false;
  return !request.headers.has('origin') && !request.headers.has('sec-fetch-site');
}
