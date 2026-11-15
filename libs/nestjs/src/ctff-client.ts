import {
  type AllFlags,
  type Client,
  type ClientOptions,
  type Context,
  createClient,
  type EvaluationDetail,
} from '@ctff/sdk';

/**
 * The SDK client, injectable anywhere once `CtffModule` is imported. Like the SDK, it keeps no cache and never
 * throws or rejects: when an evaluation can't happen, the caller's fallback value is returned.
 */
export class CtffClient implements Client {
  private readonly client: Client;

  constructor(options: ClientOptions) {
    this.client = createClient(options);
  }

  /** The variation the flag serves to the context, or `fallbackValue` when it can't be evaluated. */
  variation(flagKey: string, context: Context, fallbackValue: boolean): Promise<boolean> {
    return this.client.variation(flagKey, context, fallbackValue);
  }

  /** Like `variation`, with the variation index and the evaluation reason. */
  variationDetail(flagKey: string, context: Context, fallbackValue: boolean): Promise<EvaluationDetail> {
    return this.client.variationDetail(flagKey, context, fallbackValue);
  }

  /** Every flag of the environment, evaluated for the context in one request. */
  allFlags(context: Context): Promise<AllFlags> {
    return this.client.allFlags(context);
  }
}
