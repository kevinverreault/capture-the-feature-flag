import type { Client } from '@ctff/sdk';

/**
 * The SDK client, injectable anywhere once `CtffModule` is imported: the `Client` of `@ctff/sdk` that `createClient`
 * returns, with `variation`, `variationDetail` and `allFlags` as documented there. This class is only its injection
 * token, so the client is the SDK's own, not a wrapper.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- a class token typed as the SDK's Client.
export abstract class CtffClient {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type
export interface CtffClient extends Client {}
