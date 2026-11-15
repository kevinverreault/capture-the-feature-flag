import { evaluatorErrors, sdkKeyHeader } from '@ctff/evaluation';
import type { RequestHandler } from 'express';
import type { SnapshotPoller } from '../snapshots/snapshot-poller.js';
import type { EvaluationRequestResult, EvaluatorMetrics } from './evaluator-metrics.js';

/**
 * Times and counts every evaluation request. It is mounted ahead of the body parser, so the time runs from the
 * moment a request arrives (body parsing included) until its response is finished or the client hangs up, and a
 * request the body parser rejects still counts. The environment comes from the SDK key header, and the result from
 * the answer itself (see `resultOf`), so the controller knows nothing about metrics.
 */
export function evaluationMetricsMiddleware(metrics: EvaluatorMetrics, snapshots: SnapshotPoller): RequestHandler {
  return (request, response, next) => {
    const start = process.hrtime.bigint();
    let answered: EvaluationRequestResult | undefined;
    // Nest sends evaluations and error bodies alike through `json()`.
    const json = response.json.bind(response);
    response.json = (body: unknown) => {
      answered = resultOf(body);
      return json(body);
    };
    // `close` follows `finish` on an answered request, and comes alone when the client hangs up first.
    response.once('close', () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const sdkKey = request.get(sdkKeyHeader);
      let result: EvaluationRequestResult;
      if (!response.writableFinished) result = 'ABORTED';
      else if (!sdkKey) result = 'MISSING_SDK_KEY';
      else result = answered ?? `HTTP_${response.statusCode}`;
      metrics.observeEvaluation(sdkKey ? snapshots.identify(sdkKey) : undefined, result, durationSeconds);
    });
    next();
  };
}

/** The evaluation reason kind of a `FlagEvaluation`, or the Evaluator error of an `EvaluatorErrorBody`. */
function resultOf(body: unknown): EvaluationRequestResult | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  if ('reason' in body && typeof body.reason === 'object' && body.reason !== null && 'kind' in body.reason) {
    return body.reason.kind as EvaluationRequestResult;
  }
  if ('error' in body) return evaluatorErrors.find((error) => error === body.error);
  return undefined;
}
