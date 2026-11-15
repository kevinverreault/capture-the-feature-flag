import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { type EvaluationLabels, EvaluatorMetrics } from './evaluator-metrics.js';

const labelsKey = 'ctffEvaluationLabels';

/** Records the labels of an evaluation request, for the metrics middleware to count once the response is sent. */
export function setEvaluationLabels(response: Response, labels: EvaluationLabels): void {
  response.locals[labelsKey] = labels;
}

/**
 * Times every evaluation request, from the moment it arrives until its response is finished (so body parsing and
 * serialization count), and counts it with the labels the controller recorded. A request the controller never
 * saw, such as one with a body that isn't JSON, counts with its status code as the result.
 */
@Injectable()
export class EvaluationMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: EvaluatorMetrics) {}

  use(_request: Request, response: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    response.once('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const labels = (response.locals[labelsKey] as EvaluationLabels | undefined) ?? {
        project_key: '',
        environment_key: '',
        result: `HTTP_${response.statusCode}`,
      };
      this.metrics.observeEvaluation(labels, durationSeconds);
    });
    next();
  }
}
