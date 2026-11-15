import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { lockProject } from '../database/lock-project.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Flag, Project } from '../generated/prisma/client.js';
import { ProjectsService } from '../projects/projects.service.js';
import { offStateTargeting } from '../targeting/off-state.js';
import type { CreateFlagDto, FlagDto, UpdateFlagDto } from './flags.dto.js';
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

  async create(projectKey: string, input: CreateFlagDto): Promise<FlagDto> {
    const project = await this.projects.find(projectKey);
    try {
      const flag = await this.prisma.$transaction(async (tx) => {
        await lockProject(tx, project.id);
        const created = await tx.flag.create({
          data: {
            projectId: project.id,
            key: input.key,
            name: input.name,
            description: input.description ?? '',
            tags: input.tags ?? [],
            variations: [...booleanVariations],
          },
        });
        const environments = await tx.environment.findMany({ where: { projectId: project.id }, select: { id: true } });
        await tx.targeting.createMany({
          data: environments.map((environment) => ({
            flagId: created.id,
            environmentId: environment.id,
            ...offStateTargeting,
          })),
        });
        return created;
      });
      return toFlagDto(project, flag);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(`Flag ${input.key} already exists in project ${project.key}`);
      throw error;
    }
  }

  /** Applies an edit based on `input.version`; a flag changed since then is rejected with 409. */
  async update(projectKey: string, key: string, input: UpdateFlagDto): Promise<FlagDto> {
    const project = await this.projects.find(projectKey);
    const flag = await this.find(project, key);
    const { count } = await this.prisma.flag.updateMany({
      where: { id: flag.id, version: input.version },
      data: {
        name: input.name,
        description: input.description,
        tags: input.tags,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw staleVersion(`Flag ${key}`, input.version);
    return toFlagDto(project, await this.find(project, key));
  }

  async delete(projectKey: string, key: string): Promise<void> {
    const project = await this.projects.find(projectKey);
    const { count } = await this.prisma.flag.deleteMany({ where: { projectId: project.id, key } });
    if (count === 0) throw new NotFoundException(`Flag ${key} not found in project ${project.key}`);
  }
}

export function staleVersion(what: string, version: number): ConflictException {
  return new ConflictException(`${what} has changed since version ${version}; reload it and try again`);
}

function toFlagDto(project: Project, flag: Flag): FlagDto {
  return {
    projectKey: project.key,
    key: flag.key,
    name: flag.name,
    description: flag.description,
    tags: flag.tags,
    variations: flag.variations as boolean[],
    version: flag.version,
    createdAt: flag.createdAt,
    updatedAt: flag.updatedAt,
  };
}
