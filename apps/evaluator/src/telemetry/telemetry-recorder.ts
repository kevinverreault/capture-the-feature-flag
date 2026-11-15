import {
  type Context,
  type EnvironmentTelemetry,
  type EvaluationCount,
  minuteStartMs,
  type SeenContext,
  seenContextKey,
  type TelemetryBatch,
} from '@ctff/evaluation';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { Logger } from 'pino';
import type { EvaluatorConfig } from '../config.js';

export type TelemetryRecorderOptions = Pick<
  EvaluatorConfig,
  | 'coreUrl'
  | 'coreTimeoutMs'
  | 'telemetryFlushIntervalMs'
  | 'telemetryMaxSeenContexts'
  | 'telemetryTimeoutMs'
  | 'telemetryMaxBatchBytes'
> & { logger: Logger };

/** The telemetry of one environment gathered since the last flush, not yet sent to Core. */
interface PendingTelemetry {
  /** By flag key, variation index and minute. */
  counts: Map<string, { flagKey: string; variationIndex: number; minuteMs: number; count: number }>;
  /** By `seenContextKey()`, least recently seen first, so the oldest is the one dropped past the limit. */
  seen: Map<string, { context: Context; lastSeenMs: number }>;
}

/**
 * Adds up evaluation telemetry in memory and sends it to Core every flush interval, and once more when the app
 * shuts down (ADR 0001). Each evaluation that served a variation adds one to its flag's count for that variation
 * and minute; each context evaluated becomes a seen context with its last-seen time. A flush is sent in requests
 * of at most `telemetryMaxBatchBytes`. A request Core doesn't accept is dropped rather than kept, so a Core outage
 * can't make the Evaluator's memory grow; the dashboard loses those minutes, which is acceptable for telemetry.
 */
export class TelemetryRecorder implements OnApplicationBootstrap, OnApplicationShutdown {
  private pending = new Map<string, PendingTelemetry>();
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;

  constructor(private readonly options: TelemetryRecorderOptions) {}

  /** Records one evaluation: counted when it served a variation, and its context seen when it was valid. */
  record(sdkKey: string, flagKey: string, variationIndex: number | null, context: Context | null): void {
    const contextKey = context === null ? null : seenContextKey(context);
    if (variationIndex === null && contextKey === null) return;
    const nowMs = Date.now();
    let pending = this.pending.get(sdkKey);
    if (!pending) {
      pending = { counts: new Map(), seen: new Map() };
      this.pending.set(sdkKey, pending);
    }

    if (variationIndex !== null) {
      const minuteMs = minuteStartMs(nowMs);
      const key = `${flagKey}\n${variationIndex}\n${minuteMs}`;
      const bucket = pending.counts.get(key);
      if (bucket) bucket.count += 1;
      else pending.counts.set(key, { flagKey, variationIndex, minuteMs, count: 1 });
    }

    if (context !== null && contextKey !== null) {
      pending.seen.delete(contextKey);
      pending.seen.set(contextKey, { context, lastSeenMs: nowMs });
      if (pending.seen.size > this.options.telemetryMaxSeenContexts) {
        const oldest = pending.seen.keys().next();
        if (!oldest.done) pending.seen.delete(oldest.value);
      }
    }
  }

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule();
  }

  /** Sends what is left, so a graceful shutdown loses nothing, within the shorter Core timeout. */
  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.flush(this.options.coreTimeoutMs);
  }

  private schedule(): void {
    this.timer = setTimeout(async () => {
      await this.flush();
      if (!this.stopped) this.schedule();
    }, this.options.telemetryFlushIntervalMs);
  }

  /** Sends everything gathered since the last flush to Core, and starts over. It never throws. */
  async flush(timeoutMs = this.options.telemetryTimeoutMs): Promise<void> {
    const pending = this.pending;
    this.pending = new Map();
    const { coreUrl, logger, telemetryMaxBatchBytes } = this.options;
    for (const batch of toBatches(toEnvironmentTelemetry(pending), telemetryMaxBatchBytes)) {
      try {
        const response = await fetch(`${coreUrl}/api/v1/evaluator/telemetry`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`Core answered ${response.status} to POST /api/v1/evaluator/telemetry`);
      } catch (error) {
        // After a timeout Core may still have stored it; either way it isn't sent again.
        logger.warn(
          { err: error, environments: batch.environments.length },
          'Sending telemetry to Core failed; this batch is not sent again',
        );
      }
    }
  }
}

function toEnvironmentTelemetry(pending: Map<string, PendingTelemetry>): EnvironmentTelemetry[] {
  return [...pending].map(([sdkKey, { counts, seen }]) => ({
    sdkKey,
    counts: [...counts.values()].map(({ flagKey, variationIndex, minuteMs, count }): EvaluationCount => ({
      flagKey,
      variationIndex,
      minute: new Date(minuteMs).toISOString(),
      count,
    })),
    seenContexts: [...seen.values()].map(({ context, lastSeenMs }): SeenContext => ({
      context,
      lastSeen: new Date(lastSeenMs).toISOString(),
    })),
  }));
}

/**
 * Packs the environments' telemetry into batches of at most `maxBytes` of JSON each (unless a single count or
 * seen context is larger). An environment that doesn't fit is split across batches; Core adds the parts up.
 */
export function toBatches(environments: EnvironmentTelemetry[], maxBytes: number): TelemetryBatch[] {
  const batches: TelemetryBatch[] = [];
  const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value)) + 1;
  const emptyBatchBytes = size({ environments: [] });
  let current: EnvironmentTelemetry[] = [];
  let bytes = emptyBatchBytes;
  const close = () => {
    if (current.some((part) => part.counts.length > 0 || part.seenContexts.length > 0)) {
      batches.push({ environments: current });
    }
    current = [];
    bytes = emptyBatchBytes;
  };

  for (const { sdkKey, counts, seenContexts } of environments) {
    const partBytes = size({ sdkKey, counts: [], seenContexts: [] });
    let part: EnvironmentTelemetry | undefined;
    const open = () => {
      if (bytes + partBytes > maxBytes) close();
      part = { sdkKey, counts: [], seenContexts: [] };
      current.push(part);
      bytes += partBytes;
      return part;
    };
    const add = <T>(item: T, list: (target: EnvironmentTelemetry) => T[]) => {
      const itemBytes = size(item);
      let target = part ?? open();
      if (bytes + itemBytes > maxBytes && (target.counts.length > 0 || target.seenContexts.length > 0)) {
        close();
        target = open();
      }
      list(target).push(item);
      bytes += itemBytes;
    };
    for (const count of counts) add(count, (target) => target.counts);
    for (const seen of seenContexts) add(seen, (target) => target.seenContexts);
  }
  close();
  return batches;
}
