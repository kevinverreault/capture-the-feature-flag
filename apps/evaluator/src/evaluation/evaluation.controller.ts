import {
  evaluate,
  type EvaluationRequest,
  type EvaluatorErrorBody,
  type FlagEvaluation,
  sdkKeyHeader,
} from '@ctff/evaluation';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { setEvaluationLabels } from '../metrics/evaluation-metrics.middleware.js';
import { SnapshotPoller } from '../snapshots/snapshot-poller.js';

/** Evaluations for SDKs, answered from memory. The SDK key travels in a header, so it stays out of URLs and logs. */
@Controller('evaluate')
export class EvaluationController {
  constructor(private readonly snapshots: SnapshotPoller) {}

  /**
   * Evaluates one flag for the context in the body (`{ "context": { "user_id": …, "country": … } }`). An unknown
   * flag, or a malformed or missing context, still answers `200`, with the `FLAG_NOT_FOUND` or `ERROR` reason.
   */
  @Post(':flagKey')
  @HttpCode(200)
  evaluate(
    @Param('flagKey') flagKey: string,
    @Headers(sdkKeyHeader) sdkKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): FlagEvaluation {
    const label = (result: string, environment?: { projectKey: string; environmentKey: string }) =>
      setEvaluationLabels(response, {
        project_key: environment?.projectKey ?? '',
        environment_key: environment?.environmentKey ?? '',
        result,
      });
    if (!sdkKey) {
      label('MISSING_SDK_KEY');
      throw new BadRequestException(`The ${sdkKeyHeader} header is required`);
    }
    const held = this.snapshots.environment(sdkKey);
    // The environment the SDK key names, if the Evaluator knows it.
    const named = held.kind === 'loaded' ? held.snapshot : held.kind === 'loading' ? held : undefined;
    if (!this.snapshots.ready || held.kind === 'loading') {
      label('NOT_READY', named);
      const notReady: EvaluatorErrorBody = {
        statusCode: 503,
        error: 'NOT_READY',
        message: this.snapshots.ready
          ? "The Evaluator has not loaded this environment's snapshot yet"
          : 'The Evaluator has not loaded its first snapshots yet',
      };
      throw new ServiceUnavailableException(notReady);
    }
    if (held.kind === 'unknown') {
      label('UNKNOWN_SDK_KEY');
      const unknownSdkKey: EvaluatorErrorBody = {
        statusCode: 404,
        error: 'UNKNOWN_SDK_KEY',
        message: 'Unknown SDK key',
      };
      throw new NotFoundException(unknownSdkKey);
    }
    // Unchecked here: evaluate() validates the context at runtime and reports a malformed one.
    const request: Partial<EvaluationRequest> =
      typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {};
    const evaluation = evaluate(held.snapshot, flagKey, request.context);
    label(evaluation.reason.kind, named);
    return { flagKey, ...evaluation };
  }
}
