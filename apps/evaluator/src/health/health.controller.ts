import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SnapshotPoller } from '../snapshots/snapshot-poller.js';
import { snapshotPollerToken } from '../snapshots/snapshots.provider.js';

/** Liveness and readiness for orchestrators, outside /api/v1. */
@Controller('health')
export class HealthController {
  constructor(@Inject(snapshotPollerToken) private readonly snapshots: SnapshotPoller) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Ready once the first snapshots are loaded, so the Evaluator never serves from empty data. It stays ready while
   * Core is unreachable, because it keeps serving its last good snapshots.
   */
  @Get('ready')
  ready(): { status: 'ok' } {
    if (!this.snapshots.ready) throw new ServiceUnavailableException('The first snapshots are not loaded yet');
    return { status: 'ok' };
  }
}
