import {
  type BulkEvaluation,
  type EnvironmentSnapshot,
  evaluate,
  type EvaluationRequest,
  type EvaluatorErrorBody,
  type FlagEvaluation,
  normalizeContext,
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
import { TelemetryRecorder } from '../telemetry/telemetry-recorder.js';

/** Evaluations for SDKs, answered from memory. The SDK key travels in a header, so it stays out of URLs and logs. */
@Controller('evaluate')
export class EvaluationController {
  constructor(
    private readonly snapshots: SnapshotPoller,
    private readonly telemetry: TelemetryRecorder,
  ) {}

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
    const { key, snapshot } = this.environment(sdkKey);
    const context = contextOf(body);
    const result = evaluate(snapshot, flagKey, context);
    this.telemetry.record(key, flagKey, result.variationIndex, normalizeContext(context));
    return { flagKey, ...result };
  }

  /**
   * Evaluates every flag of the environment for the context in the body, in flag key order. Flags that evaluate as
   * not found (archived ones) are left out. A malformed or missing context gives every flag the `ERROR` reason.
   * Telemetry counts each flag's evaluation, as if it had been evaluated alone.
   */
  @Post()
  @HttpCode(200)
  evaluateAll(@Headers(sdkKeyHeader) sdkKey: string | undefined, @Body() body: unknown): BulkEvaluation {
    const { key, snapshot } = this.environment(sdkKey);
    const context = contextOf(body);
    const flags = snapshot.flags
      // Each flag against a snapshot of it alone, so evaluate() finds it at once: linear in the number of flags.
      .map((flag): FlagEvaluation => ({
        flagKey: flag.key,
        ...evaluate({ ...snapshot, flags: [flag] }, flag.key, context),
      }))
      .filter((evaluation) => evaluation.reason.kind !== 'FLAG_NOT_FOUND')
      .sort(byFlagKey);
    const seen = normalizeContext(context);
    for (const evaluation of flags) this.telemetry.record(key, evaluation.flagKey, evaluation.variationIndex, seen);
    // A context evaluated in an environment without flags is seen all the same, as with an unknown flag.
    if (flags.length === 0) this.telemetry.record(key, '', null, seen);
    return { flags };
  }

  /**
   * The SDK key, checked present, and the snapshot of its environment; throws the error answer when there is none
   * to evaluate from.
   */
  private environment(sdkKey: string | undefined): { key: string; snapshot: EnvironmentSnapshot } {
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
    return { key: sdkKey, snapshot: held.snapshot };
  }
}

/** Orders by flag key, the way Core orders a snapshot's flags (plain code-unit order, independent of locale). */
function byFlagKey(a: FlagEvaluation, b: FlagEvaluation): number {
  if (a.flagKey === b.flagKey) return 0;
  return a.flagKey < b.flagKey ? -1 : 1;
}

/** The context of a request body, unchecked: evaluate() validates it at runtime and reports a malformed one. */
function contextOf(body: unknown): EvaluationRequest['context'] | undefined {
  const request: Partial<EvaluationRequest> =
    typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {};
  return request.context;
}
