import type { Variation } from '@ctff/evaluation';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertKeyUnchanged } from '../common/keys.js';
import { updateAtVersion, withUniqueKey } from '../common/persistence.js';
import { lockProject } from '../database/lock-project.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Flag, Project } from '../generated/prisma/client.js';
import { projectNotFound, ProjectsService } from '../projects/projects.service.js';
import { offStateTargeting } from '../targeting/off-state.js';
import type { FlagListItemDto } from './flag-list.dto.js';
import type { CreateFlagDto, FlagDto, UpdateFlagDto } from './flags.dto.js';
import { booleanVariations } from './variations.js';

@Injectable()
export class FlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  /** The project's flags by key, each with its targeting on or off in every environment; archived ones on request. */
  async list(projectKey: string, { includeArchived }: { includeArchived: boolean }): Promise<FlagListItemDto[]> {
    const project = await this.projects.find(projectKey);
    const flags = await this.prisma.flag.findMany({
      where: { projectId: project.id, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { key: 'asc' },
      include: {
        targeting: {
          select: { on: true, environment: { select: { key: true } } },
          orderBy: { environment: { createdAt: 'asc' } },
        },
      },
    });
    return flags.map(({ targeting, ...flag }) => ({
      ...toFlagDto(project, flag),
      targeting: targeting.map((row) => ({ environmentKey: row.environment.key, on: row.on })),
    }));
  }

  async get(projectKey: string, key: string): Promise<FlagDto> {
    const project = await this.projects.find(projectKey);
    return toFlagDto(project, await this.find(project, key));
  }

  /** Loads a flag of the project by key, or fails with 404. */
  async find(project: Project, key: string): Promise<Flag> {
    const flag = await this.prisma.flag.findUnique({ where: { projectId_key: { projectId: project.id, key } } });
    if (!flag) throw new NotFoundException(`Flag ${key} not found in project ${project.key}`);
    return flag;
  }

  /** Creates the flag with off-state targeting in every environment of the project. */
  async create(projectKey: string, input: CreateFlagDto): Promise<FlagDto> {
    const project = await this.projects.find(projectKey);
    const flag = await withUniqueKey(
      () =>
        this.prisma.$transaction(async (tx) => {
          if (!(await lockProject(tx, project.id))) throw projectNotFound(project.key);
          const created = await tx.flag.create({
            data: {
              projectId: project.id,
              key: input.key,
              name: input.name,
              description: input.description ?? '',
              tags: input.tags ?? [],
              managedBy: input.managedBy ?? null,
              variations: [...booleanVariations],
            },
          });
          const environments = await tx.environment.findMany({
            where: { projectId: project.id },
            select: { id: true },
          });
          await tx.targeting.createMany({
            data: environments.map((environment) => ({
              flagId: created.id,
              environmentId: environment.id,
              ...offStateTargeting,
            })),
          });
          return created;
        }),
      `Flag ${input.key} already exists in project ${project.key}`,
    );
    return toFlagDto(project, flag);
  }

  /** Applies an edit based on `input.version`; a flag changed since then is rejected with 409. */
  async update(projectKey: string, key: string, input: UpdateFlagDto): Promise<FlagDto> {
    const project = await this.projects.find(projectKey);
    const flag = await this.find(project, key);
    assertKeyUnchanged('flag', flag.key, input.key);
    assertNotArchived(flag);
    await updateAtVersion(
      () =>
        this.prisma.flag.updateMany({
          // Archiving bumps the version, so a flag archived since it was loaded is rejected too.
          where: { id: flag.id, version: input.version },
          data: {
            name: input.name,
            description: input.description,
            tags: input.tags,
            managedBy: input.managedBy,
            version: { increment: 1 },
          },
        }),
      `Flag ${key}`,
      input.version,
    );
    return toFlagDto(project, await this.find(project, key));
  }

  /** Archives the flag, leaving its targeting as it is; archiving an archived flag changes nothing. */
  archive(projectKey: string, key: string): Promise<FlagDto> {
    return this.setArchived(projectKey, key, true);
  }

  /** Restores an archived flag, with the targeting it had; restoring a flag that isn't archived changes nothing. */
  restore(projectKey: string, key: string): Promise<FlagDto> {
    return this.setArchived(projectKey, key, false);
  }

  /** Archives or restores the flag, bumping its version only when that changes it. */
  private async setArchived(projectKey: string, key: string, archived: boolean): Promise<FlagDto> {
    const project = await this.projects.find(projectKey);
    const flag = await this.find(project, key);
    await this.prisma.flag.updateMany({
      where: { id: flag.id, archivedAt: archived ? null : { not: null } },
      data: { archivedAt: archived ? new Date() : null, version: { increment: 1 } },
    });
    return toFlagDto(project, await this.find(project, key));
  }

  /** Permanently deletes an archived flag with its targeting in every environment; any other is rejected with 409. */
  async delete(projectKey: string, key: string): Promise<void> {
    const project = await this.projects.find(projectKey);
    const flag = await this.find(project, key);
    // Filtered on archivedAt, so a flag restored in the meantime is not deleted.
    const { count } = await this.prisma.flag.deleteMany({ where: { id: flag.id, archivedAt: { not: null } } });
    if (count === 0 && (await this.prisma.flag.count({ where: { id: flag.id } })) > 0) {
      throw new ConflictException(`Flag ${key} is not archived; archive it before deleting it`);
    }
  }
}

/** Rejects a change to an archived flag with 409: it stays as it was archived until restored. */
export function assertNotArchived(flag: Flag): void {
  if (flag.archivedAt !== null) {
    throw new ConflictException(`Flag ${flag.key} is archived; restore it before changing it`);
  }
}

function toFlagDto(project: Project, flag: Flag): FlagDto {
  return {
    projectKey: project.key,
    key: flag.key,
    name: flag.name,
    description: flag.description,
    tags: flag.tags,
    variations: flag.variations as Variation[],
    version: flag.version,
    managedBy: flag.managedBy,
    archived: flag.archivedAt !== null,
    archivedAt: flag.archivedAt,
    createdAt: flag.createdAt,
    updatedAt: flag.updatedAt,
  };
}
