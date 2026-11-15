import type { Variation } from '@ctff/evaluation';
import { Injectable, NotFoundException } from '@nestjs/common';
import { assertKeyUnchanged } from '../common/keys.js';
import { updateAtVersion, withUniqueKey } from '../common/persistence.js';
import { lockProject } from '../database/lock-project.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Flag, Project } from '../generated/prisma/client.js';
import { projectNotFound, ProjectsService } from '../projects/projects.service.js';
import { offStateTargeting } from '../targeting/off-state.js';
import type { CreateFlagDto, FlagDto, ManagedBy, UpdateFlagDto } from './flags.dto.js';
import { booleanVariations } from './variations.js';

@Injectable()
export class FlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async list(projectKey: string): Promise<FlagDto[]> {
    const project = await this.projects.find(projectKey);
    const flags = await this.prisma.flag.findMany({ where: { projectId: project.id }, orderBy: { key: 'asc' } });
    return flags.map((flag) => toFlagDto(project, flag));
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
    await updateAtVersion(
      () =>
        this.prisma.flag.updateMany({
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

  /** Deletes the flag with its targeting in every environment. */
  async delete(projectKey: string, key: string): Promise<void> {
    const project = await this.projects.find(projectKey);
    const flag = await this.find(project, key);
    await this.prisma.flag.deleteMany({ where: { id: flag.id } });
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
    // The column only ever holds values the API accepted.
    managedBy: flag.managedBy as ManagedBy | null,
    createdAt: flag.createdAt,
    updatedAt: flag.updatedAt,
  };
}
