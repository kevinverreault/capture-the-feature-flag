import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { SnapshotPoller } from './snapshot-poller.js';

export const snapshotPollerToken = Symbol('SnapshotPoller');

/** Starts polling Core when the app boots, and stops when it shuts down. */
@Injectable()
export class SnapshotPolling implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(snapshotPollerToken) private readonly poller: SnapshotPoller) {}

  onApplicationBootstrap(): void {
    this.poller.start();
  }

  onApplicationShutdown(): void {
    this.poller.stop();
  }
}
