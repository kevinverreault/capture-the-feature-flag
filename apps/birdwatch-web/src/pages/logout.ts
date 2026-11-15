import type { APIRoute } from 'astro';
import { endSession } from '../lib/session';

/** "Switch birder": forgets the session, back to the birder picker. */
export const POST: APIRoute = ({ cookies, redirect }) => {
  endSession(cookies);
  return redirect('/login', 303);
};
