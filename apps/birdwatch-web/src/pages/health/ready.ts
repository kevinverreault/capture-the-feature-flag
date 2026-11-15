import type { APIRoute } from 'astro';

/** Readiness: ready while birdwatch-api answers its own readiness check, since every page needs it. */
export const GET: APIRoute = async ({ locals }) => {
  try {
    const response = await fetch(`${locals.apiUrl}/health/ready`, { signal: AbortSignal.timeout(2000) });
    if (response.ok) return Response.json({ status: 'ok' });
  } catch {
    // Unreachable: not ready.
  }
  return Response.json({ status: 'unavailable', message: 'birdwatch-api is not ready' }, { status: 503 });
};
