import { jwtVerify, SignJWT } from 'jose';
import type { Birder } from '../data/birders.js';

/** What a session token says about its birder: `sub` is their user ID. */
export interface SessionClaims {
  sub: string;
  name: string;
  country: string;
}

/** How long a fake login lasts. */
export const sessionTtlSeconds = 12 * 60 * 60;

const algorithm = 'HS256';
const issuer = 'birdwatch-api';

/**
 * Signs the fake login of a birder: a JWT (HS256) with their user ID as `sub`, their name and their country. The
 * key is a fixed dev key; nothing here is real authentication.
 */
export async function signSession(birder: Birder, secret: string, now = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ name: birder.name, country: birder.country })
    .setProtectedHeader({ alg: algorithm, typ: 'JWT' })
    .setSubject(birder.id)
    .setIssuer(issuer)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + sessionTtlSeconds)
    .sign(key(secret));
}

/** The claims of a session token, or `null` when it is malformed, signed with another key or expired. */
export async function verifySession(token: string, secret: string, now = new Date()): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: [algorithm],
      issuer,
      currentDate: now,
      requiredClaims: ['sub', 'exp'],
    });
    const { sub, name, country } = payload;
    if (typeof sub !== 'string' || typeof name !== 'string' || typeof country !== 'string') return null;
    return { sub, name, country };
  } catch {
    return null;
  }
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}
