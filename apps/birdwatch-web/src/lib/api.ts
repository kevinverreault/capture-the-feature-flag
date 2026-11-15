import type {
  AllFlags,
  BirdersResponse,
  FeedResponse,
  LoggedSightingResponse,
  SessionResponse,
  SpeciesResponse,
} from '@ctff/birdwatch-contract';

// The shapes birdwatch-api answers with come from @ctff/birdwatch-contract, which both apps share.
export type { AllFlags, Birder, FeedSighting, Rarity, Species } from '@ctff/birdwatch-contract';

/** What the "log a sighting" form sends, as typed in (birdwatch-api checks it). */
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
    birders: () => call<BirdersResponse>('GET', '/birders'),
    logIn: (birderId: string) => call<SessionResponse>('POST', '/session', { birderId }),
    sightings: () => call<FeedResponse>('GET', '/sightings'),
    species: () => call<SpeciesResponse>('GET', '/species'),
    logSighting: (sighting: NewSighting) => call<LoggedSightingResponse>('POST', '/sightings', sighting),
  };
}

/** Whether a flag serves `true`, with `false` as the fallback value when the flags couldn't be loaded. */
export function flagOn(flags: AllFlags, flagKey: string): boolean {
  return flags.values[flagKey] ?? false;
}
