import {
  type BulkEvaluation,
  type EnvironmentSnapshot,
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
  ServiceUnavailableException,
} from '@nestjs/common';
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
  ): FlagEvaluation {
    const snapshot = this.snapshot(sdkKey);
    return { flagKey, ...evaluate(snapshot, flagKey, contextOf(body)) };
  }

  /**
   * Evaluates every flag of the environment for the context in the body, in flag key order. Flags that evaluate as
   * not found (archived ones) are left out. A malformed or missing context gives every flag the `ERROR` reason.
   */
  @Post()
  @HttpCode(200)
  evaluateAll(@Headers(sdkKeyHeader) sdkKey: string | undefined, @Body() body: unknown): BulkEvaluation {
    const snapshot = this.snapshot(sdkKey);
    const context = contextOf(body);
    const flags = snapshot.flags
      .map((flag): FlagEvaluation => ({ flagKey: flag.key, ...evaluate(snapshot, flag.key, context) }))
      .filter((evaluation) => evaluation.reason.kind !== 'FLAG_NOT_FOUND')
      .sort((a, b) => (a.flagKey < b.flagKey ? -1 : a.flagKey > b.flagKey ? 1 : 0));
    return { flags };
  }

  /** The snapshot of the SDK key's environment; throws the error answer when there is none to evaluate from. */
  private snapshot(sdkKey: string | undefined): EnvironmentSnapshot {
    if (!sdkKey) throw new BadRequestException(`The ${sdkKeyHeader} header is required`);
    const held = this.snapshots.environment(sdkKey);
    if (!this.snapshots.ready || held.kind === 'loading') {
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
      const unknownSdkKey: EvaluatorErrorBody = {
        statusCode: 404,
        error: 'UNKNOWN_SDK_KEY',
        message: 'Unknown SDK key',
      };
      throw new NotFoundException(unknownSdkKey);
    }
    return held.snapshot;
  }
}

/** The context of a request body, unchecked: evaluate() validates it at runtime and reports a malformed one. */
function contextOf(body: unknown): EvaluationRequest['context'] | undefined {
  const request: Partial<EvaluationRequest> =
    typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {};
  return request.context;
}
