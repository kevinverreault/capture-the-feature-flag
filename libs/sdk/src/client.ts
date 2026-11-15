import {
  type Context,
  type EvaluationErrorKind,
  type EvaluationReason as GenericEvaluationReason,
  type EvaluationRequest,
  type EvaluatorError,
  evaluatorErrors,
  sdkKeyHeader,
} from '@ctff/evaluation';

export interface ClientOptions {
  /** The base URL of an Evaluator, such as `http://evaluator:3000`. */
  evaluatorUrl: string;
  /** The SDK key of the environment to evaluate in. */
  sdkKey: string;
  /** How long to wait for the Evaluator before returning the fallback value. Defaults to 500 ms. */
  timeoutMs?: number;
}

const defaultTimeoutMs = 500;

/**
 * Why the SDK returned what it did: an `ERROR` reason names what went wrong in evaluation itself (a malformed
 * flag or context), at the Evaluator (an unknown SDK key, not ready) or on the way there.
 */
export type ErrorKind =
  | EvaluationErrorKind
  | EvaluatorError
  /** The Evaluator didn't answer within the timeout. */
  | 'TIMEOUT'
  /** The Evaluator is unreachable. */
  | 'NETWORK_ERROR'
  /** The Evaluator answered with another error, or with something that isn't an evaluation. */
  | 'EVALUATOR_ERROR';

export type EvaluationReason = GenericEvaluationReason<ErrorKind>;

/** The variation an evaluation served, with why; or the fallback value, with why no variation was served. */
export interface EvaluationDetail {
  /** The served variation, or the caller's fallback value when no variation could be served. */
  value: boolean;
  /** The index of the served variation, or `null` when the fallback value was returned. */
  variationIndex: number | null;
  reason: EvaluationReason;
}

/** The evaluation of one flag in `allFlags`: a served variation, or none (`null`) with the `ERROR` reason. */
export type FlagDetail = EvaluationDetail | { value: null; variationIndex: null; reason: EvaluationReason };

/**
 * Every flag of the environment, evaluated for one context. When the Evaluator can't be asked or answers with an
 * error, there are no flags and `error` says why, so looking a flag up in `values` falls back on the caller's side:
 * `flags.values['rare-bird-alerts'] ?? false`.
 */
export interface AllFlags {
  /** The served variation of every flag that served one, by flag key. */
  values: Record<string, boolean>;
  /** The evaluation of every flag, by flag key, including flags that served no variation because of an error. */
  details: Record<string, FlagDetail>;
  /** `null` when the Evaluator answered; otherwise why there are no flags, such as `UNKNOWN_SDK_KEY` or `TIMEOUT`. */
  error: ErrorKind | null;
}

/**
 * Evaluates flags through an Evaluator. There is no local cache: every call is one request to the Evaluator.
 * No method ever throws or rejects; when an evaluation can't happen, the caller's fallback value is returned.
 */
export interface Client {
  /** The variation the flag serves to the context, or `fallbackValue` when it can't be evaluated. */
  variation(flagKey: string, context: Context, fallbackValue: boolean): Promise<boolean>;
  /** Like `variation`, with the variation index and the evaluation reason. */
  variationDetail(flagKey: string, context: Context, fallbackValue: boolean): Promise<EvaluationDetail>;
  /**
   * Every flag of the environment, evaluated for the context in one request. Archived flags are left out. There is
   * no fallback value to pass: a flag missing from the result falls back on the caller's side.
   */
  allFlags(context: Context): Promise<AllFlags>;
}

export function createClient(options: ClientOptions): Client {
  const { sdkKey, timeoutMs = defaultTimeoutMs } = options;
  if (!options.evaluatorUrl) throw new TypeError('evaluatorUrl is required');
  if (!sdkKey) throw new TypeError('sdkKey is required');
  if (!(timeoutMs > 0)) throw new TypeError('timeoutMs must be a positive number of milliseconds');
  const evaluatorUrl = options.evaluatorUrl.replace(/\/+$/, '');

  /** POSTs an evaluation request, and resolves to the answer, or to why there is none. Never rejects. */
  async function post(path: string, context: Context): Promise<{ answer: unknown } | { error: ErrorKind }> {
    try {
      const body: EvaluationRequest = { context };
      const response = await fetch(`${evaluatorUrl}/api/v1/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [sdkKeyHeader]: sdkKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Reading the body can still time out (caught below); only a body that isn't JSON is tolerated here.
      const answer = parseJson(await response.text());
      return response.ok ? { answer } : { error: errorKindOf(answer) };
    } catch (cause) {
      return { error: cause instanceof DOMException && cause.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR' };
    }
  }

  async function variationDetail(flagKey: string, context: Context, fallbackValue: boolean): Promise<EvaluationDetail> {
    const fallback = (reason: EvaluationReason): EvaluationDetail => ({
      value: fallbackValue,
      variationIndex: null,
      reason,
    });
    const answered = await post(`evaluate/${encodeURIComponent(flagKey)}`, context);
    if ('error' in answered) return fallback({ kind: 'ERROR', errorKind: answered.error });
    const evaluation = asFlagEvaluation(answered.answer);
    if (!evaluation) return fallback({ kind: 'ERROR', errorKind: 'EVALUATOR_ERROR' });
    if (evaluation.value === null) return fallback(evaluation.reason);
    return { value: evaluation.value, variationIndex: evaluation.variationIndex, reason: evaluation.reason };
  }

  async function allFlags(context: Context): Promise<AllFlags> {
    const none = (error: ErrorKind): AllFlags => ({ values: {}, details: {}, error });
    const answered = await post('evaluate', context);
    if ('error' in answered) return none(answered.error);
    const { answer } = answered;
    const entries = isObject(answer) && Array.isArray(answer['flags']) ? answer['flags'] : null;
    if (!entries) return none('EVALUATOR_ERROR');
    const result: AllFlags = { values: {}, details: {}, error: null };
    for (const entry of entries) {
      const evaluation = asFlagEvaluation(entry);
      const flagKey = isObject(entry) ? entry['flagKey'] : undefined;
      if (!evaluation || typeof flagKey !== 'string') return none('EVALUATOR_ERROR');
      // An Evaluator leaves out flags it can't find; should one list such a flag anyway, it has no evaluation.
      if (evaluation.reason.kind === 'FLAG_NOT_FOUND') continue;
      const { reason } = evaluation;
      if (evaluation.value === null) result.details[flagKey] = { value: null, variationIndex: null, reason };
      else {
        result.details[flagKey] = { value: evaluation.value, variationIndex: evaluation.variationIndex, reason };
        result.values[flagKey] = evaluation.value;
      }
    }
    return result;
  }

  return {
    variationDetail,
    variation: async (flagKey, context, fallbackValue) =>
      (await variationDetail(flagKey, context, fallbackValue)).value,
    allFlags,
  };
}

/** The error kind an Evaluator error answer names (`UNKNOWN_SDK_KEY`, `NOT_READY`), or `EVALUATOR_ERROR`. */
function errorKindOf(answer: unknown): ErrorKind {
  const error = isObject(answer) ? answer['error'] : undefined;
  return evaluatorErrors.find((known) => known === error) ?? 'EVALUATOR_ERROR';
}

/** An evaluation as an Evaluator answers it, checked at runtime. */
type CheckedEvaluation =
  | { value: boolean; variationIndex: number; reason: EvaluationReason }
  | { value: null; variationIndex: null; reason: EvaluationReason };

/**
 * The answer as a single-flag evaluation, or `null` when it isn't a consistent one: a served variation must come
 * with a reason that serves one, and no variation with `FLAG_NOT_FOUND` or `ERROR`. Reasons this SDK doesn't
 * know yet are accepted for served variations, so a newer Evaluator keeps working.
 */
function asFlagEvaluation(answer: unknown): CheckedEvaluation | null {
  if (!isObject(answer) || !isObject(answer['reason'])) return null;
  const { value, variationIndex, reason } = answer;
  const kind = reason['kind'];
  if (typeof kind !== 'string') return null;
  if (value === null && variationIndex === null) {
    const consistent = kind === 'FLAG_NOT_FOUND' || (kind === 'ERROR' && typeof reason['errorKind'] === 'string');
    return consistent ? (answer as CheckedEvaluation) : null;
  }
  const served = typeof value === 'boolean' && Number.isInteger(variationIndex);
  return served && kind !== 'FLAG_NOT_FOUND' && kind !== 'ERROR' ? (answer as CheckedEvaluation) : null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
