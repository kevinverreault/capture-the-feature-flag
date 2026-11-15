import type { Context, EvaluationResult } from './evaluation.js';

/**
 * The wire types between Core, Evaluators and SDKs (ADR 0001). Core serves the environment list and snapshots,
 * the Evaluator serves evaluations, and the test fake of Core is built from these same types.
 */

/** The header that carries the SDK key, on Core's snapshot endpoint and on the Evaluator's evaluation endpoints. */
export const sdkKeyHeader = 'x-ctff-sdk-key';

/** One environment an Evaluator keeps a snapshot of. */
export interface EnvironmentListEntry {
  projectKey: string;
  environmentKey: string;
  sdkKey: string;
}

/** Every environment of every project, as Core serves it at `GET /api/v1/evaluator/environments`. */
export interface EnvironmentList {
  /** Ordered by SDK key. */
  environments: EnvironmentListEntry[];
}

/** The body of a single-flag evaluation request to the Evaluator (`POST /api/v1/evaluate/{flagKey}`). */
export interface EvaluationRequest {
  context: Context;
}

/** The Evaluator's answer to a single-flag evaluation request. */
export type FlagEvaluation = EvaluationResult & { flagKey: string };

/** The body of an error answer from the Evaluator, such as `404` for an unknown SDK key. */
export interface EvaluatorErrorBody {
  statusCode: number;
  /** `UNKNOWN_SDK_KEY` or `NOT_READY` for errors an SDK reports as such; otherwise a generic HTTP error name. */
  error: string;
  message: string;
}
