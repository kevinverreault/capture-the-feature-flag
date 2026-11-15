import { type EnvironmentList, type EnvironmentSnapshot, sdkKeyHeader } from '@ctff/evaluation';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { Logger } from 'pino';
import type { EvaluatorConfig } from '../config.js';

interface Held<T> {
  body: T;
  etag: string | undefined;
}

interface HeldSnapshot extends Held<EnvironmentSnapshot> {
  /** When Core last confirmed this snapshot as current, with a `200` or a `304` (epoch milliseconds). */
  checkedAt: number;
}

/** A snapshot the Evaluator holds, and when Core last confirmed it as current. */
export interface HeldSnapshotInfo {
  projectKey: string;
  environmentKey: string;
  /** Epoch milliseconds. */
  checkedAt: number;
}

type Fetched<T> = { kind: 'changed'; held: Held<T> } | { kind: 'unchanged' } | { kind: 'not-found' };

export type SnapshotPollerOptions = Pick<EvaluatorConfig, 'coreUrl' | 'pollIntervalMs' | 'coreTimeoutMs'> & {
  logger: Logger;
};

/** What the Evaluator holds for an SDK key. */
export type HeldEnvironment =
  | { kind: 'loaded'; snapshot: EnvironmentSnapshot }
  /** Core lists the environment, but its snapshot hasn't loaded yet. */
  | { kind: 'loading'; projectKey: string; environmentKey: string }
  /** Core doesn't list the environment. */
  | { kind: 'unknown' };

/**
 * Keeps an in-memory snapshot of every environment, polled from Core (ADR 0001). Each poll fetches the
 * environment list, then the snapshot of every environment on it, sending the ETag already held as If-None-Match
 * so unchanged ones cost a `304`. Whatever fails to load keeps its last good copy, so a Core outage leaves the
 * Evaluator serving what it had. Nest starts it when the app boots and stops it when the app shuts down.
 */
export class SnapshotPoller implements OnApplicationBootstrap, OnApplicationShutdown {
  private list: Held<EnvironmentList> | undefined;
  private readonly snapshots = new Map<string, HeldSnapshot>();
  /** SDK keys whose snapshot failed to load on the last poll, so each failure is logged once. */
  private readonly failing = new Set<string>();
  private loaded = false;
  private coreReachable = true;
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;

  constructor(private readonly options: SnapshotPollerOptions) {}

  /**
   * Whether a poll has loaded the environment list and at least one snapshot on it (or found the list empty), so
   * the Evaluator never serves from empty data. One environment that keeps failing doesn't hold back the others.
   * Stays true from then on, including while Core is unreachable.
   */
  get ready(): boolean {
    return this.loaded;
  }

  environment(sdkKey: string): HeldEnvironment {
    const held = this.snapshots.get(sdkKey);
    if (held) return { kind: 'loaded', snapshot: held.body };
    const listed = this.list?.body.environments.find((entry) => entry.sdkKey === sdkKey);
    return listed
      ? { kind: 'loading', projectKey: listed.projectKey, environmentKey: listed.environmentKey }
      : { kind: 'unknown' };
  }

  /** Every snapshot held, with when Core last confirmed it; one that keeps failing to load grows old. */
  heldSnapshots(): HeldSnapshotInfo[] {
    return [...this.snapshots.values()].map(({ body, checkedAt }) => ({
      projectKey: body.projectKey,
      environmentKey: body.environmentKey,
      checkedAt,
    }));
  }

  /** Polls now, then again every poll interval after each poll ends, until the app shuts down. */
  onApplicationBootstrap(): void {
    this.stopped = false;
    void this.pollAndReschedule();
  }

  onApplicationShutdown(): void {
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
      [...sdkKeys].forEach((sdkKey, index) => {
        const result = results[index];
        if (result?.status === 'rejected') {
          if (!this.failing.has(sdkKey)) {
            const entry = this.list?.body.environments.find((candidate) => candidate.sdkKey === sdkKey);
            logger.warn(
              { err: result.reason, projectKey: entry?.projectKey, environmentKey: entry?.environmentKey },
              'Loading a snapshot failed; serving its last good copy until it succeeds',
            );
          }
          this.failing.add(sdkKey);
        } else this.failing.delete(sdkKey);
      });
      for (const sdkKey of this.failing) if (!sdkKeys.has(sdkKey)) this.failing.delete(sdkKey);

      if (!this.coreReachable) logger.info('Core is reachable again');
      this.coreReachable = true;
      if (!this.loaded && (sdkKeys.size === 0 || this.snapshots.size > 0)) {
        logger.info({ environments: sdkKeys.size, loaded: this.snapshots.size }, 'First snapshots loaded');
        this.loaded = true;
      }
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
    if (fetched.kind === 'unchanged') {
      if (held) held.checkedAt = Date.now();
      return;
    }
    if (fetched.kind === 'not-found') {
      // Deleted after Core listed it; it leaves the list on the next poll.
      this.snapshots.delete(sdkKey);
      return;
    }
    if (!Array.isArray(fetched.held.body.flags)) throw new Error('Core sent a malformed snapshot');
    this.snapshots.set(sdkKey, { ...fetched.held, checkedAt: Date.now() });
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
