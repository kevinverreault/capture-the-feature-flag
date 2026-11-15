import type { EnvironmentSnapshot, Variation } from '@ctff/evaluation';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { toTargetingSnapshot } from '../targeting/targeting-snapshot.js';
import { type JsonWithEtag, toJsonWithEtag } from './json-with-etag.js';

@Injectable()
export class SnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async forSdkKey(sdkKey: string): Promise<JsonWithEtag> {
    const environment = await this.prisma.environment.findUnique({ where: { sdkKey }, include: { project: true } });
    if (!environment) throw new NotFoundException('Unknown SDK key');

    const targeting = await this.prisma.targeting.findMany({
      // Archived flags are left out, so they evaluate as not found.
      where: { environmentId: environment.id, flag: { archivedAt: null } },
      include: { flag: true },
      orderBy: { flag: { key: 'asc' } },
    });

    const snapshot: EnvironmentSnapshot = {
      projectKey: environment.project.key,
      environmentKey: environment.key,
      flags: targeting.map(({ flag, ...row }) => ({
        key: flag.key,
        variations: flag.variations as Variation[],
        version: flag.version,
        targeting: toTargetingSnapshot(row),
      })),
    };

    return toJsonWithEtag(snapshot);
  }
}
