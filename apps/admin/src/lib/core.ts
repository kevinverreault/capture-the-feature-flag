import { type CoreApiClient, createCoreApiClient } from '@ctff/core-api-client';

/**
 * The client for the Core the admin app calls. It goes over HTTP even when Core hosts the admin app in the same
 * process (ADR 0003), so moving the admin app into its own container only changes the base URL. Changes are
 * attributed to the admin's display name, if set.
 */
export function coreApi(locals: App.Locals): CoreApiClient {
  if (!locals.coreBaseUrl) {
    throw new Error('The admin app does not know where Core is: mount it with host.js, or set CORE_URL.');
  }
  return createCoreApiClient({ baseUrl: locals.coreBaseUrl, actor: locals.actor });
}
