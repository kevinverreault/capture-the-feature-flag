import { createCoreApiClient } from '@ctff/core-api-client';
import type { Logger } from 'pino';
import type { BirdwatchApiConfig } from './config.js';

/** The pause between two attempts at looking the SDK key up in Core. */
const retryIntervalMs = 2000;

/**
 * The SDK key of the environment the API evaluates flags in: CTFF_SDK_KEY, or else looked up in Core by project and
 * environment key. SDK keys are generated, so the demo can't know them in advance. Until Core answers with the
 * environment (Core starting, or the project not created yet, as when Terraform creates it), it keeps trying, and
 * the API doesn't start listening.
 */
export async function resolveSdkKey(source: BirdwatchApiConfig['sdkKey'], logger: Logger): Promise<string> {
  if ('sdkKey' in source) return source.sdkKey;
  const { coreUrl, projectKey, environmentKey } = source;
  const core = createCoreApiClient({ baseUrl: coreUrl });
  for (;;) {
    let problem: string;
    try {
      const { data, response } = await core.GET('/api/v1/projects/{projectKey}/environments/{environmentKey}', {
        params: { path: { projectKey, environmentKey } },
        signal: AbortSignal.timeout(5000),
      });
      if (data) {
        logger.info({ coreUrl, projectKey, environmentKey }, 'Found the SDK key of the environment in Core');
        return data.sdkKey;
      }
      problem = `Core answered ${response.status}`;
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    logger.warn(
      { coreUrl, projectKey, environmentKey, problem },
      'Waiting for the environment in Core to get its SDK key',
    );
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
  }
}
