import createClient, { type Client } from 'openapi-fetch';
import type { components, paths } from './generated/schema.js';

export type { components, paths } from './generated/schema.js';

type Schemas = components['schemas'];
export type Project = Schemas['ProjectDto'];
export type CreateProject = Schemas['CreateProjectDto'];
export type UpdateProject = Schemas['UpdateProjectDto'];
export type Environment = Schemas['EnvironmentDto'];
export type CreateEnvironment = Schemas['CreateEnvironmentDto'];
export type UpdateEnvironment = Schemas['UpdateEnvironmentDto'];

/** A typed client for Core's API: `core.GET('/api/v1/projects')`, with paths, parameters and bodies checked. */
export type CoreApiClient = Client<paths>;

export interface CoreApiClientOptions {
  /** Core's origin, such as `http://core:3000`. The paths already carry the `/api/v1` prefix. */
  baseUrl: string;
}

export function createCoreApiClient({ baseUrl }: CoreApiClientOptions): CoreApiClient {
  return createClient<paths>({ baseUrl: baseUrl.replace(/\/+$/, '') });
}

/** An error response from Core: its status and its messages (one per validation failure for a 400). */
export class CoreApiError extends Error {
  constructor(
    readonly status: number,
    readonly messages: string[],
  ) {
    super(`Core answered ${status}: ${messages.join('; ')}`);
    this.name = 'CoreApiError';
  }
}

/**
 * Waits for a request made with the client and returns its body, or throws a {@link CoreApiError} for an error
 * response. Core's errors carry `message` as a string or, for validation failures, a list of strings.
 */
export async function unwrap<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await request;
  if (response.ok) return data as T;
  throw new CoreApiError(response.status, errorMessages(error, response.status));
}

function errorMessages(body: unknown, status: number): string[] {
  const message = typeof body === 'object' && body !== null ? (body as { message?: unknown }).message : undefined;
  if (typeof message === 'string' && message.trim() !== '') return [message];
  if (Array.isArray(message)) {
    const messages = message.filter((item): item is string => typeof item === 'string');
    if (messages.length > 0) return messages;
  }
  return [`Core answered ${status}`];
}
