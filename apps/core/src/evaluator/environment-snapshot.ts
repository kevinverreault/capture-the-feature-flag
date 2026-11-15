import type { EnvironmentSnapshot, Variation } from '@ctff/evaluation';
import type { PrismaService } from '../database/prisma.service.js';
import { notArchived } from '../flags/archived.js';
import type { Environment, Project } from '../generated/prisma/client.js';
import { toTargetingSnapshot } from '../targeting/targeting-snapshot.js';

/** An environment's snapshot, with the name of each of its flags (snapshots carry only keys). */
export interface LoadedSnapshot {
  snapshot: EnvironmentSnapshot;
  flagNames: ReadonlyMap<string, string>;
}

/**
 * The targeting snapshot of an environment as it is now: what Core serves the Evaluators (ADR 0001), and what it
 * evaluates contexts against itself, so both serve the same variations.
 */
export async function loadEnvironmentSnapshot(
  prisma: PrismaService,
  project: Pick<Project, 'key'>,
  environment: Pick<Environment, 'id' | 'key'>,
): Promise<LoadedSnapshot> {
  const targeting = await prisma.targeting.findMany({
    // Archived flags are left out, so they evaluate as not found.
    where: { environmentId: environment.id, flag: notArchived },
    include: { flag: true },
    orderBy: { flag: { key: 'asc' } },
  });
  return {
    snapshot: {
      projectKey: project.key,
      environmentKey: environment.key,
      flags: targeting.map(({ flag, ...row }) => ({
        key: flag.key,
        variations: flag.variations as Variation[],
        version: flag.version,
        targeting: toTargetingSnapshot(row),
      })),
    },
    flagNames: new Map(targeting.map(({ flag }) => [flag.key, flag.name])),
  };
}
