import createClient, { type Client } from 'openapi-fetch';
import type { components, paths } from './generated/schema.js';

export type { components, paths } from './generated/schema.js';

type Schemas = components['schemas'];
export type Project = Schemas['ProjectDto'];
export type Environment = Schemas['EnvironmentDto'];
export type AuditEntry = Schemas['AuditEntryDto'];
export type AuditEntryPage = Schemas['AuditEntryPageDto'];
export type Settings = Schemas['SettingsDto'];
export type DashboardSummary = Schemas['DashboardSummaryDto'];
export type EvaluationRange = Schemas['EvaluationRange'];
export type EvaluationSeries = Schemas['EvaluationSeriesDto'];
export type StaleFlags = Schemas['StaleFlagsDto'];
export type ContextAttribute = Schemas['ContextAttributeDto'];
export type Context = Schemas['ContextDto'];
export type SeenContext = Schemas['StoredSeenContextDto'];
export type ContextEvaluation = Schemas['ContextEvaluationDto'];
export type FlagContextEvaluation = Schemas['FlagContextEvaluationDto'];
export type EvaluationReason = Schemas['EvaluationReasonDto'];

/** A typed client for Core's API: `core.GET('/api/v1/projects')`, with paths, parameters and bodies checked. */
export type CoreApiClient = Client<paths>;

export interface CoreApiClientOptions {
  /** Core's origin, such as `http://core:3000`. The paths already carry the `/api/v1` prefix. */
  baseUrl: string;
  /**
   * Who the changes made with this client are attributed to in their audit entries, sent as `X-CTFF-Actor`. It
   * is percent-encoded, so any display name fits in the header; empty or absent, Core records `anonymous`.
   */
  actor?: string | undefined;
}

export function createCoreApiClient({ baseUrl, actor }: CoreApiClientOptions): CoreApiClient {
  return createClient<paths>({
    baseUrl: baseUrl.replace(/\/+$/, ''),
    headers: actor ? { 'X-CTFF-Actor': encodeURIComponent(actor) } : {},
  });
}

/**
 * An error response from Core: its status, its messages (one per validation failure for a 400), and for a 400 the
 * same messages grouped by the property of the request body they are about.
 */
export class CoreApiError extends Error {
  constructor(
    readonly status: number,
    readonly messages: string[],
    readonly fields: Readonly<Record<string, readonly string[]>> = {},
  ) {
    super(`Core answered ${status}: ${messages.join('; ')}`);
    this.name = 'CoreApiError';
  }
}

/**
 * Waits for a request made with the client and returns its body, or throws a {@link CoreApiError} for an error
 * response. Core's errors carry `message` as a string or, for validation failures, a list of strings along with
 * `fields`, the same messages by property.
 */
export async function unwrap<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await request;
  if (response.ok) return data as T;
  throw new CoreApiError(response.status, errorMessages(error, response.status), fieldMessages(error));
}

function fieldMessages(body: unknown): Record<string, string[]> {
  const fields = typeof body === 'object' && body !== null ? (body as { fields?: unknown }).fields : undefined;
  if (typeof fields !== 'object' || fields === null) return {};
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(fields)) {
    if (Array.isArray(messages)) result[field] = messages.filter((item): item is string => typeof item === 'string');
  }
  return result;
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
