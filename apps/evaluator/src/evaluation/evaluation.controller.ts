import { evaluate, type FlagEvaluation, sdkKeyHeader } from '@ctff/evaluation';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  Headers,
} from '@nestjs/common';
import { SnapshotPoller } from '../snapshots/snapshot-poller.js';
import { snapshotPollerToken } from '../snapshots/snapshots.provider.js';

/** Evaluations for SDKs, answered from memory. The SDK key travels in a header, so it stays out of URLs and logs. */
@Controller('evaluate')
export class EvaluationController {
  constructor(@Inject(snapshotPollerToken) private readonly snapshots: SnapshotPoller) {}

  /**
   * Evaluates one flag for the context in the body (`{ "context": { "user_id": …, "country": … } }`). An unknown
   * flag, or a malformed context, still answers `200`, with the `FLAG_NOT_FOUND` or `ERROR` reason.
   */
  @Post(':flagKey')
  @HttpCode(200)
  evaluate(
    @Param('flagKey') flagKey: string,
    @Headers(sdkKeyHeader) sdkKey: string | undefined,
    @Body() body: unknown,
  ): FlagEvaluation {
    if (!sdkKey) throw new BadRequestException(`The ${sdkKeyHeader} header is required`);
    if (!this.snapshots.ready) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'NOT_READY',
        message: 'The Evaluator has not loaded its first snapshot yet',
      });
    }
    const snapshot = this.snapshots.snapshot(sdkKey);
    if (!snapshot) {
      throw new NotFoundException({ statusCode: 404, error: 'UNKNOWN_SDK_KEY', message: 'Unknown SDK key' });
    }
    const context = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['context'] : body;
    return { flagKey, ...evaluate(snapshot, flagKey, context as never) };
  }
}
