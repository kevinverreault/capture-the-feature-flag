import type { APIRoute } from 'astro';

/** Liveness: answers as long as the server runs. */
export const GET: APIRoute = () => Response.json({ status: 'ok' });
