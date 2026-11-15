import type { Context, EnvironmentTelemetry, EvaluationCount, SeenContext, TelemetryBatch } from '@ctff/evaluation';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { Logger } from 'pino';
import type { EvaluatorConfig } from '../config.js';

export type TelemetryRecorderOptions = Pick<
  EvaluatorConfig,
  'coreUrl' | 'coreTimeoutMs' | 'telemetryFlushIntervalMs' | 'telemetryMaxSeenContexts'
> & { logger: Logger };

/** What one environment has gathered since the last flush. */
interface Gathered {
  /** By flag key, variation index and minute. */
  counts: Map<string, { flagKey: string; variationIndex: number; minuteMs: number; count: number }>;
  /** By context, least recently seen first, so the oldest is the one dropped past the limit. */
  seen: Map<string, { context: Context; lastSeenMs: number }>;
}

/**
 * Adds up evaluation telemetry in memory and sends it to Core every flush interval, and once more when the app
 * shuts down (ADR 0001). Each evaluation that served a variation adds one to its flag's count for that variation
 * and minute; each context evaluated becomes a seen context with its last-seen time. A batch Core doesn't accept
 * is dropped rather than kept, so a Core outage can't make the Evaluator's memory grow; the dashboard loses those
 * minutes, which is acceptable for telemetry.
 */
export class TelemetryRecorder implements OnApplicationBootstrap, OnApplicationShutdown {
  private gathered = new Map<string, Gathered>();
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;

  constructor(private readonly options: TelemetryRecorderOptions) {}

  /** Records one evaluation: counted when it served a variation, and its context seen when it was valid. */
  record(sdkKey: string, flagKey: string, variationIndex: number | null, context: Context | null): void {
    if (variationIndex === null && context === null) return;
    const nowMs = Date.now();
    let gathered = this.gathered.get(sdkKey);
    if (!gathered) {
      gathered = { counts: new Map(), seen: new Map() };
      this.gathered.set(sdkKey, gathered);
    }

    if (variationIndex !== null) {
      const minuteMs = nowMs - (nowMs % 60_000);
      const key = `${flagKey}\n${variationIndex}\n${minuteMs}`;
      const bucket = gathered.counts.get(key);
      if (bucket) bucket.count += 1;
      else gathered.counts.set(key, { flagKey, variationIndex, minuteMs, count: 1 });
    }

    // A context without attributes describes no one to inspect, so it isn't recorded.
    if (context !== null && (context.user_id !== undefined || context.country !== undefined)) {
      const key = `${context.user_id ?? ''}\n${context.country ?? ''}`;
      gathered.seen.delete(key);
      gathered.seen.set(key, { context, lastSeenMs: nowMs });
      if (gathered.seen.size > this.options.telemetryMaxSeenContexts) {
        const oldest = gathered.seen.keys().next();
        if (!oldest.done) gathered.seen.delete(oldest.value);
      }
    }
  }

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule();
  }

  /** Sends what is left, so a graceful shutdown loses nothing. */
  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.flush();
  }

  private schedule(): void {
    this.timer = setTimeout(async () => {
      await this.flush();
      if (!this.stopped) this.schedule();
    }, this.options.telemetryFlushIntervalMs);
  }

  /** Sends everything gathered since the last flush to Core, and starts over. It never throws. */
  async flush(): Promise<void> {
    const gathered = this.gathered;
    this.gathered = new Map();
    const batch = toBatch(gathered);
    if (batch.environments.length === 0) return;

    const { coreUrl, coreTimeoutMs, logger } = this.options;
    try {
      const response = await fetch(`${coreUrl}/api/v1/evaluator/telemetry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(coreTimeoutMs),
      });
      if (!response.ok) throw new Error(`Core answered ${response.status} to POST /api/v1/evaluator/telemetry`);
    } catch (error) {
      logger.warn(
        { err: error, environments: batch.environments.length },
        'Sending telemetry to Core failed; this batch is dropped',
      );
    }
  }
}

function toBatch(gathered: Map<string, Gathered>): TelemetryBatch {
  const environments: EnvironmentTelemetry[] = [];
  for (const [sdkKey, { counts, seen }] of gathered) {
    environments.push({
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
    });
  }
  return { environments };
}
