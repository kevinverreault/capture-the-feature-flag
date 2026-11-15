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

/**
 * The errors the Evaluator names in its error answers, so SDKs can report them as such. They are error kinds of
 * their own, on top of `evaluationErrorKinds`: they stop an evaluation before `evaluate()` runs.
 */
export const evaluatorErrors = [
  /** `404`: the SDK key names no environment the Evaluator holds a snapshot of. */
  'UNKNOWN_SDK_KEY',
  /** `503`: the Evaluator hasn't loaded its first snapshots yet, or not yet the snapshot of this SDK key. */
  'NOT_READY',
] as const;
export type EvaluatorError = (typeof evaluatorErrors)[number];

/** The body of an error answer from the Evaluator, such as `404` for an unknown SDK key. */
export interface EvaluatorErrorBody {
  statusCode: number;
  /** One of `evaluatorErrors`, or a generic HTTP error name (such as `Bad Request`) for other errors. */
  error: EvaluatorError | (string & {});
  message: string;
}

/**
 * Evaluation telemetry, which Evaluators add up in memory and send to Core about every minute
 * (`POST /api/v1/evaluator/telemetry`, ADR 0001). A batch lost when an Evaluator crashes is acceptable.
 */
export interface TelemetryBatch {
  environments: EnvironmentTelemetry[];
}

/** The telemetry of one environment, named by its SDK key. */
export interface EnvironmentTelemetry {
  sdkKey: string;
  counts: EvaluationCount[];
  seenContexts: SeenContext[];
}

/** How many evaluations of one flag served one variation within one minute. */
export interface EvaluationCount {
  flagKey: string;
  /** Index into the flag's `variations`. Only evaluations that served a variation are counted. */
  variationIndex: number;
  /** The start of the minute, as an ISO 8601 timestamp with zero seconds (e.g. `2026-11-15T12:34:00.000Z`). */
  minute: string;
  count: number;
}

/** A context that was evaluated in the environment, and when it was last. */
export interface SeenContext {
  context: Context;
  /** An ISO 8601 timestamp. */
  lastSeen: string;
}

/** The start of the minute a moment falls in, as `EvaluationCount.minute` expects it. */
export function minuteOf(moment: Date | number): string {
  const ms = typeof moment === 'number' ? moment : moment.getTime();
  return new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
}
