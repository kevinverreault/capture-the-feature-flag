import type { EnvironmentList } from '@ctff/evaluation';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { type JsonWithEtag, toJsonWithEtag } from './json-with-etag.js';

/** The list of every environment of every project, so Evaluators know which snapshots to poll. */
@Injectable()
export class EnvironmentListService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<JsonWithEtag> {
    const environments = await this.prisma.environment.findMany({
      include: { project: true },
      orderBy: { sdkKey: 'asc' },
    });
    const list: EnvironmentList = {
      environments: environments.map((environment) => ({
        projectKey: environment.project.key,
        environmentKey: environment.key,
        sdkKey: environment.sdkKey,
      })),
    };
    return toJsonWithEtag(list);
  }
}
