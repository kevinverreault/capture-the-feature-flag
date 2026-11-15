import type { Variation } from '@ctff/evaluation';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { flagState, recordAudit } from '../audit/audit-entry.js';
import { assertKeyUnchanged } from '../common/keys.js';
import { updateAtVersion, withUniqueKey } from '../common/persistence.js';
import { lockAndReload, lockRow } from '../database/lock-row.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Flag, Project } from '../generated/prisma/client.js';
import { projectNotFound, ProjectsService } from '../projects/projects.service.js';
import { offStateTargeting } from '../targeting/off-state.js';
import type { FlagListItemDto } from './flag-list.dto.js';
import type { CreateFlagDto, FlagDto, UpdateFlagDto } from './flags.dto.js';
import { archived, assertNotArchived, isArchived, notArchived } from './archived.js';
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
      where: { projectId: project.id, ...(includeArchived ? {} : notArchived) },
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
    if (!flag) throw flagNotFound(project, key);
    return flag;
  }

  /** Creates the flag with off-state targeting in every environment of the project. */
  async create(projectKey: string, input: CreateFlagDto, actor: string): Promise<FlagDto> {
    const project = await this.projects.find(projectKey);
    const flag = await withUniqueKey(
      () =>
        this.prisma.$transaction(async (tx) => {
          if (!(await lockRow(tx, 'project', project.id))) throw projectNotFound(project.key);
          const existing = await tx.flag.findUnique({
            where: { projectId_key: { projectId: project.id, key: input.key } },
          });
          if (existing && isArchived(existing)) {
            throw new ConflictException(
              `Flag ${input.key} already exists in project ${project.key} and is archived; ` +
                'restore it, or delete it permanently to reuse its key',
            );
          }
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
          await recordAudit(
            tx,
            { type: 'flag', project, flag: created },
            {
              action: 'create',
              actor,
              after: flagState(created),
            },
          );
          return created;
        }),
      `Flag ${input.key} already exists in project ${project.key}`,
    );
    return toFlagDto(project, flag);
  }

  /** Applies an edit based on `input.version`; a flag changed since then is rejected with 409. */
  async update(projectKey: string, key: string, input: UpdateFlagDto, actor: string): Promise<FlagDto> {
    const project = await this.projects.find(projectKey);
    const found = await this.find(project, key);
    assertKeyUnchanged('flag', found.key, input.key);
    const updated = await this.prisma.$transaction(async (tx) => {
      const flag = await lockAndReload(tx, 'flag', found.id, () => flagNotFound(project, key));
      assertNotArchived(flag);
      await updateAtVersion(
        () =>
          tx.flag.updateMany({
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
      const updated = await tx.flag.findUniqueOrThrow({ where: { id: flag.id } });
      await recordAudit(
        tx,
        { type: 'flag', project, flag: updated },
        {
          action: 'update',
          actor,
          before: flagState(flag),
          after: flagState(updated),
        },
      );
      return updated;
    });
    return toFlagDto(project, updated);
  }

  /** Archives the flag, leaving its targeting as it is; archiving an archived flag changes (and records) nothing. */
  archive(projectKey: string, key: string, actor: string): Promise<FlagDto> {
    return this.setArchived(projectKey, key, true, actor);
  }

  /**
   * Restores an archived flag, with the targeting it had; restoring a flag that isn't archived changes (and
   * records) nothing.
   */
  restore(projectKey: string, key: string, actor: string): Promise<FlagDto> {
    return this.setArchived(projectKey, key, false, actor);
  }

  /** Archives or restores the flag, bumping its version and recording the change only when that changes it. */
  private async setArchived(projectKey: string, key: string, archive: boolean, actor: string): Promise<FlagDto> {
    const project = await this.projects.find(projectKey);
    const found = await this.find(project, key);
    const flag = await this.prisma.$transaction(async (tx) => {
      const flag = await lockAndReload(tx, 'flag', found.id, () => flagNotFound(project, key));
      if (isArchived(flag) === archive) return flag;
      const updated = await tx.flag.update({
        where: { id: flag.id },
        data: { archivedAt: archive ? new Date() : null, version: { increment: 1 } },
      });
      await recordAudit(
        tx,
        { type: 'flag', project, flag: updated },
        {
          action: archive ? 'archive' : 'restore',
          actor,
          before: flagState(flag),
          after: flagState(updated),
        },
      );
      return updated;
    });
    return toFlagDto(project, flag);
  }

  /** Permanently deletes an archived flag with its targeting in every environment; any other is rejected with 409. */
  async delete(projectKey: string, key: string, actor: string): Promise<void> {
    const project = await this.projects.find(projectKey);
    const found = await this.find(project, key);
    await this.prisma.$transaction(async (tx) => {
      // Checked under the lock, so a flag restored in the meantime is not deleted.
      const flag = await lockAndReload(tx, 'flag', found.id, () => flagNotFound(project, key));
      if (!isArchived(flag)) throw new ConflictException(`Flag ${key} is not archived; archive it before deleting it`);
      await tx.flag.delete({ where: { id: flag.id } });
      await recordAudit(tx, { type: 'flag', project, flag }, { action: 'delete', actor, before: flagState(flag) });
    });
  }
}

function flagNotFound(project: Project, key: string): NotFoundException {
  return new NotFoundException(`Flag ${key} not found in project ${project.key}`);
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
    archived: isArchived(flag),
    archivedAt: flag.archivedAt,
    createdAt: flag.createdAt,
    updatedAt: flag.updatedAt,
  };
}
