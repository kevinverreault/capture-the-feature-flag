import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { lockProject } from '../database/lock-project.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Environment, Project } from '../generated/prisma/client.js';
import { ProjectsService } from '../projects/projects.service.js';
import { offStateTargeting } from '../targeting/off-state.js';
import type { CreateEnvironmentDto, EnvironmentDto, UpdateEnvironmentDto } from './environments.dto.js';
import { generateSdkKey } from './sdk-key.js';

@Injectable()
export class EnvironmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async list(projectKey: string): Promise<EnvironmentDto[]> {
    const project = await this.projects.find(projectKey);
    const environments = await this.prisma.environment.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    });
    return environments.map((environment) => toEnvironmentDto(project, environment));
  }

  async get(projectKey: string, key: string): Promise<EnvironmentDto> {
    const project = await this.projects.find(projectKey);
    return toEnvironmentDto(project, await this.find(project, key));
  }

  /** Loads an environment of the project by key, or fails with 404. */
  async find(project: Project, key: string): Promise<Environment> {
    const environment = await this.prisma.environment.findUnique({
      where: { projectId_key: { projectId: project.id, key } },
    });
    if (!environment) throw new NotFoundException(`Environment ${key} not found in project ${project.key}`);
    return environment;
  }

  async create(projectKey: string, input: CreateEnvironmentDto): Promise<EnvironmentDto> {
    const project = await this.projects.find(projectKey);
    try {
      const environment = await this.prisma.$transaction(async (tx) => {
        await lockProject(tx, project.id);
        const created = await tx.environment.create({
          data: { projectId: project.id, key: input.key, name: input.name, sdkKey: generateSdkKey() },
        });
        const flags = await tx.flag.findMany({ where: { projectId: project.id }, select: { id: true } });
        await tx.targeting.createMany({
          data: flags.map((flag) => ({ flagId: flag.id, environmentId: created.id, ...offStateTargeting })),
        });
        return created;
      });
      return toEnvironmentDto(project, environment);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Environment ${input.key} already exists in project ${project.key}`);
      }
      throw error;
    }
  }

  async update(projectKey: string, key: string, input: UpdateEnvironmentDto): Promise<EnvironmentDto> {
    const project = await this.projects.find(projectKey);
    const environment = await this.find(project, key);
    const updated = await this.prisma.environment.update({
      where: { id: environment.id },
      data: { name: input.name },
    });
    return toEnvironmentDto(project, updated);
  }

  /** Deletes the environment with the targeting of every flag in it. */
  async delete(projectKey: string, key: string): Promise<void> {
    const project = await this.projects.find(projectKey);
    const { count } = await this.prisma.environment.deleteMany({ where: { projectId: project.id, key } });
    if (count === 0) throw new NotFoundException(`Environment ${key} not found in project ${project.key}`);
  }
}

function toEnvironmentDto(project: Project, environment: Environment): EnvironmentDto {
  return {
    projectKey: project.key,
    key: environment.key,
    name: environment.name,
    sdkKey: environment.sdkKey,
    createdAt: environment.createdAt,
    updatedAt: environment.updatedAt,
  };
}
