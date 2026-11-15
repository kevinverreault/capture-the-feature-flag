import { type EnvironmentList, type EnvironmentSnapshot, sdkKeyHeader } from '@ctff/evaluation';
import type { Logger } from 'pino';

interface Held<T> {
  body: T;
  etag: string | undefined;
}

type Fetched<T> = { kind: 'changed'; held: Held<T> } | { kind: 'unchanged' } | { kind: 'not-found' };

export interface SnapshotPollerOptions {
  coreUrl: string;
  pollIntervalMs: number;
  coreTimeoutMs: number;
  logger: Logger;
}

/**
 * Keeps an in-memory snapshot of every environment, polled from Core (ADR 0001). Each poll fetches the
 * environment list, then the snapshot of every environment on it, sending the ETag already held as If-None-Match
 * so unchanged ones cost a `304`. Whatever fails to load keeps its last good copy, so a Core outage leaves the
 * Evaluator serving what it had.
 */
export class SnapshotPoller {
  private list: Held<EnvironmentList> | undefined;
  private readonly snapshots = new Map<string, Held<EnvironmentSnapshot>>();
  private loaded = false;
  private coreReachable = true;
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;

  constructor(private readonly options: SnapshotPollerOptions) {}

  /** Whether the first poll has loaded the environment list and every snapshot on it. Stays true from then on. */
  get ready(): boolean {
    return this.loaded;
  }

  /** The snapshot of the SDK key's environment, or `undefined` for an SDK key Core didn't list. */
  snapshot(sdkKey: string): EnvironmentSnapshot | undefined {
    return this.snapshots.get(sdkKey)?.body;
  }

  /** Polls now, then again every poll interval after each poll ends, until stopped. */
  start(): void {
    this.stopped = false;
    void this.pollAndReschedule();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private async pollAndReschedule(): Promise<void> {
    await this.poll();
    if (!this.stopped) this.timer = setTimeout(() => void this.pollAndReschedule(), this.options.pollIntervalMs);
  }

  /** One poll. It never throws: failures are logged, and leave the last good snapshots in place. */
  async poll(): Promise<void> {
    const { logger } = this.options;
    try {
      const list = await this.fetch<EnvironmentList>('/api/v1/evaluator/environments', this.list?.etag);
      if (list.kind === 'not-found') throw new Error('Core has no environment list');
      if (list.kind === 'changed') {
        if (!Array.isArray(list.held.body.environments)) throw new Error('Core sent a malformed environment list');
        this.list = list.held;
      }
      const sdkKeys = new Set(this.list?.body.environments.map((entry) => entry.sdkKey));
      for (const sdkKey of this.snapshots.keys()) if (!sdkKeys.has(sdkKey)) this.snapshots.delete(sdkKey);

      const results = await Promise.allSettled([...sdkKeys].map((sdkKey) => this.pollSnapshot(sdkKey)));
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map((failure) => failure.reason),
          `${failures.length} of ${sdkKeys.size} snapshots failed to load`,
        );
      }

      if (!this.coreReachable) logger.info('Core is reachable again');
      this.coreReachable = true;
      if (!this.loaded) logger.info({ environments: sdkKeys.size }, 'First snapshots loaded');
      this.loaded = true;
    } catch (error) {
      if (this.coreReachable) {
        logger.warn({ err: error }, 'Polling Core failed; serving the last good snapshots until it succeeds');
      }
      this.coreReachable = false;
    }
  }

  private async pollSnapshot(sdkKey: string): Promise<void> {
    const held = this.snapshots.get(sdkKey);
    const fetched = await this.fetch<EnvironmentSnapshot>('/api/v1/evaluator/snapshot', held?.etag, sdkKey);
    if (fetched.kind === 'unchanged') return;
    if (fetched.kind === 'not-found') {
      // Deleted after Core listed it; it leaves the list on the next poll.
      this.snapshots.delete(sdkKey);
      return;
    }
    if (!Array.isArray(fetched.held.body.flags)) throw new Error('Core sent a malformed snapshot');
    this.snapshots.set(sdkKey, fetched.held);
  }

  /** GETs from Core, sending the ETag held as If-None-Match. Throws on errors other than `404`. */
  private async fetch<T>(path: string, etag: string | undefined, sdkKey?: string): Promise<Fetched<T>> {
    const headers: Record<string, string> = {};
    if (etag) headers['if-none-match'] = etag;
    if (sdkKey) headers[sdkKeyHeader] = sdkKey;
    const response = await fetch(`${this.options.coreUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(this.options.coreTimeoutMs),
    });
    if (response.status === 304) return { kind: 'unchanged' };
    if (response.status === 404) return { kind: 'not-found' };
    if (!response.ok) throw new Error(`Core answered ${response.status} to GET ${path}`);
    const body = (await response.json()) as T;
    return { kind: 'changed', held: { body, etag: response.headers.get('etag') ?? undefined } };
  }
}
