import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { CORE_CONFIG, type CoreConfig } from '../config.js';
import { PrismaService } from '../database/prisma.service.js';
import type { SettingsDto } from '../settings/settings.dto.js';
import { SettingsService } from '../settings/settings.service.js';
import { lockSeenContexts, trimSeenContexts } from './seen-context-cap.js';

const day = 24 * 60 * 60_000;

/**
 * The retention job: deletes count buckets older than the metric retention, and seen contexts last seen longer
 * ago than the seen-context retention, and trims every environment's seen contexts to the cap. It runs when Core
 * starts, every retention interval after that, and whenever the settings change, so a change takes effect at
 * once. Several Core replicas may run it at the same time; it only deletes, so that is harmless.
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(CORE_CONFIG) private readonly config: CoreConfig,
    @InjectPinoLogger(RetentionService.name) private readonly logger: PinoLogger,
  ) {
    settings.onChange((changed) => this.run(changed));
  }

  async onApplicationBootstrap(): Promise<void> {
    this.stopped = false;
    await this.run();
    this.schedule();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      await this.run();
      this.schedule();
    }, this.config.retentionIntervalMs);
  }

  /** One run, with the settings given or the current ones. It never throws: a failure is logged. */
  async run(settings?: SettingsDto): Promise<void> {
    try {
      const { metricRetentionDays, seenContextRetentionDays, seenContextCap } = settings ?? (await this.settings.get());
      const now = Date.now();
      const counts = await this.prisma.evaluationCount.deleteMany({
        where: { minute: { lt: new Date(now - metricRetentionDays * day) } },
      });
      const expired = await this.prisma.seenContext.deleteMany({
        where: { lastSeen: { lt: new Date(now - seenContextRetentionDays * day) } },
      });
      // One environment at a time, under the lock ingestion takes, so the two never deadlock.
      let overCap = 0;
      for (const { id } of await this.prisma.environment.findMany({ select: { id: true } })) {
        overCap += await this.prisma.$transaction(async (tx) => {
          await lockSeenContexts(tx, [id]);
          return trimSeenContexts(tx, seenContextCap, id);
        });
      }
      if (counts.count + expired.count + overCap > 0) {
        this.logger.info(
          { countBuckets: counts.count, seenContexts: expired.count + overCap },
          'Retention deleted old telemetry',
        );
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Retention failed; it runs again at the next interval');
    }
  }
}
