import { describe, expect, it } from 'vitest';
import { sessionTtlSeconds, signSession, verifySession } from '../src/session/session-token.js';

const secret = 'test-secret';
const alice = { id: 'alice', name: 'Alice Tremblay', country: 'CA', homePatch: 'Point Pelee, Ontario' };

describe('session tokens', () => {
  it('carry the birder’s user ID, name and country', async () => {
    const token = await signSession(alice, secret);
    expect(token.split('.')).toHaveLength(3);
    expect(await verifySession(token, secret)).toEqual({ sub: 'alice', name: 'Alice Tremblay', country: 'CA' });
  });

  it('are refused when signed with another key', async () => {
    const token = await signSession(alice, 'another-secret');
    expect(await verifySession(token, secret)).toBeNull();
  });

  it('are refused once tampered with', async () => {
    const [header, , signature] = (await signSession(alice, secret)).split('.');
    const claims = Buffer.from(JSON.stringify({ sub: 'bram', name: 'Bram', country: 'NL' })).toString('base64url');
    expect(await verifySession(`${header}.${claims}.${signature}`, secret)).toBeNull();
  });

  it('expire after their lifetime', async () => {
    const issued = new Date('2026-11-15T08:00:00Z');
    const token = await signSession(alice, secret, issued);
    const justBefore = new Date(issued.getTime() + (sessionTtlSeconds - 1) * 1000);
    const after = new Date(issued.getTime() + (sessionTtlSeconds + 1) * 1000);
    expect(await verifySession(token, secret, justBefore)).not.toBeNull();
    expect(await verifySession(token, secret, after)).toBeNull();
  });

  it('are refused when they are not tokens', async () => {
    expect(await verifySession('', secret)).toBeNull();
    expect(await verifySession('not-a-token', secret)).toBeNull();
  });
});
