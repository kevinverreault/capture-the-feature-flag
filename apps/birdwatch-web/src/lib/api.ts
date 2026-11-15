import type { AllFlags, Context } from '@ctff/sdk';

// The shapes birdwatch-api answers with (see apps/birdwatch-api). The flags are the SDK's `AllFlags`, as
// `@Flags()` loads them for the logged-in birder.
export type { AllFlags, Context };

export interface Birder {
  id: string;
  name: string;
  country: string;
  homePatch: string;
}

export type Rarity = 'common' | 'uncommon' | 'rare';

export interface Species {
  id: string;
  commonName: string;
  scientificName: string;
  family: string;
  rarity: Rarity;
  description: string;
}

export interface FeedSighting {
  id: string;
  location: string;
  count: number;
  notes: string;
  observedAt: string;
  species: Pick<Species, 'id' | 'commonName' | 'scientificName' | 'rarity'>;
  birder: Pick<Birder, 'id' | 'name' | 'country'>;
}

export interface NewSighting {
  speciesId: string;
  location: string;
  count: string;
  notes: string;
}

/** birdwatch-api refused the session token: it expired, or was signed with another key. Log in again. */
export class SessionExpired extends Error {
  constructor() {
    super('The session expired');
    this.name = 'SessionExpired';
  }
}

/** birdwatch-api answered with an error other than an expired session. `fields` are per-field messages for a 400. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Calls birdwatch-api, as the birder whose session token it is given, if any. */
export function birdwatchApi(locals: App.Locals, token?: string) {
  if (!locals.apiUrl) throw new Error('Birdwatch does not know where birdwatch-api is: set BIRDWATCH_API_URL.');

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${locals.apiUrl}/api${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401) throw new SessionExpired();
    const answer = (await response.json().catch(() => ({}))) as { message?: unknown; fields?: unknown };
    if (!response.ok) {
      const message = typeof answer.message === 'string' ? answer.message : `birdwatch-api answered ${response.status}`;
      const fields = typeof answer.fields === 'object' && answer.fields !== null ? answer.fields : {};
      throw new ApiError(response.status, message, fields as Record<string, string>);
    }
    return answer as T;
  }

  return {
    birders: () => call<{ birders: Birder[] }>('GET', '/birders'),
    logIn: (birderId: string) =>
      call<{ token: string; expiresInSeconds: number; birder: Birder }>('POST', '/session', { birderId }),
    me: () => call<{ birder: Birder; context: Context; flags: AllFlags }>('GET', '/me'),
    sightings: () => call<{ sightings: FeedSighting[]; flags: AllFlags }>('GET', '/sightings'),
    species: () => call<{ species: Species[]; flags: AllFlags }>('GET', '/species'),
    logSighting: (sighting: NewSighting) => call<{ sighting: { id: string } }>('POST', '/sightings', sighting),
  };
}

/** Whether a flag serves `true`, with `false` as the fallback value when the flags couldn't be loaded. */
export function flagOn(flags: AllFlags, flagKey: string): boolean {
  return flags.values[flagKey] ?? false;
}
