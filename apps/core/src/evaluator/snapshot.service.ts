import type { EnvironmentList, EnvironmentSnapshot, Variation } from '@ctff/evaluation';
import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { toTargetingSnapshot } from '../targeting/targeting-snapshot.js';

export interface Serialized {
  /** The body as JSON, exactly as it is sent. */
  json: string;
  /** A strong ETag derived from the JSON, so it changes exactly when the body does. */
  etag: string;
}

@Injectable()
export class SnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every environment of every project, so Evaluators know which snapshots to poll. */
  async environments(): Promise<Serialized> {
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
    return serialize(list);
  }

  async forSdkKey(sdkKey: string): Promise<Serialized> {
    const environment = await this.prisma.environment.findUnique({ where: { sdkKey }, include: { project: true } });
    if (!environment) throw new NotFoundException('Unknown SDK key');

    const targeting = await this.prisma.targeting.findMany({
      where: { environmentId: environment.id },
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

    return serialize(snapshot);
  }
}

function serialize(body: unknown): Serialized {
  const json = JSON.stringify(body);
  return { json, etag: `"${createHash('sha256').update(json).digest('base64url')}"` };
}

/** Whether an If-None-Match header matches the ETag (weak comparison, as RFC 9110 requires for this header). */
export function matchesIfNoneMatch(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some((candidate) => candidate.trim() === '*' || opaque(candidate) === opaque(etag));
}
