import type { Variation } from '@ctff/evaluation';
import { Injectable, NotFoundException } from '@nestjs/common';
import { flagState, recordAudit } from '../audit/audit-entry.js';
import { assertKeyUnchanged } from '../common/keys.js';
import { updateAtVersion, withUniqueKey } from '../common/persistence.js';
import { lockProject } from '../database/lock-project.js';
import { lockRow } from '../database/lock-row.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Flag, Prisma, Project } from '../generated/prisma/client.js';
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

  /** The project's flags by key, each with its targeting on or off in every environment. */
  async list(projectKey: string): Promise<FlagListItemDto[]> {
    const project = await this.projects.find(projectKey);
    const flags = await this.prisma.flag.findMany({
      where: { projectId: project.id },
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
      const flag = await this.lock(tx, project, found);
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

  /** Deletes the flag with its targeting in every environment. */
  async delete(projectKey: string, key: string, actor: string): Promise<void> {
    const project = await this.projects.find(projectKey);
    const found = await this.find(project, key);
    await this.prisma.$transaction(async (tx) => {
      const flag = await this.lock(tx, project, found);
      await tx.flag.delete({ where: { id: flag.id } });
      await recordAudit(tx, { type: 'flag', project, flag }, { action: 'delete', actor, before: flagState(flag) });
    });
  }

  /** Locks the flag's row and reloads it, or fails with 404 when it was deleted meanwhile. */
  private async lock(tx: Prisma.TransactionClient, project: Project, flag: Flag): Promise<Flag> {
    if (!(await lockRow(tx, 'flag', flag.id))) throw flagNotFound(project, flag.key);
    return tx.flag.findUniqueOrThrow({ where: { id: flag.id } });
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
    createdAt: flag.createdAt,
    updatedAt: flag.updatedAt,
  };
}
