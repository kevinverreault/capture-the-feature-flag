import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { loadEnvironmentSnapshot } from './environment-snapshot.js';
import { type JsonWithEtag, toJsonWithEtag } from './json-with-etag.js';

@Injectable()
export class SnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async forSdkKey(sdkKey: string): Promise<JsonWithEtag> {
    const environment = await this.prisma.environment.findUnique({ where: { sdkKey }, include: { project: true } });
    if (!environment) throw new NotFoundException('Unknown SDK key');
    const { snapshot } = await loadEnvironmentSnapshot(this.prisma, environment.project, environment);
    return toJsonWithEtag(snapshot);
  }
}
