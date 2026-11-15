import { Injectable, NotFoundException } from '@nestjs/common';
import { assertKeyUnchanged } from '../common/keys.js';
import { withUniqueKey } from '../common/persistence.js';
import { lockProject } from '../database/lock-project.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Environment, Project } from '../generated/prisma/client.js';
import { projectNotFound, ProjectsService } from '../projects/projects.service.js';
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

  /** Creates the environment with off-state targeting for every existing flag of the project. */
  async create(projectKey: string, input: CreateEnvironmentDto): Promise<EnvironmentDto> {
    const project = await this.projects.find(projectKey);
    const environment = await withUniqueKey(
      () =>
        this.prisma.$transaction(async (tx) => {
          if (!(await lockProject(tx, project.id))) throw projectNotFound(project.key);
          const created = await tx.environment.create({
            data: { projectId: project.id, key: input.key, name: input.name, sdkKey: generateSdkKey() },
          });
          const flags = await tx.flag.findMany({ where: { projectId: project.id }, select: { id: true } });
          await tx.targeting.createMany({
            data: flags.map((flag) => ({ flagId: flag.id, environmentId: created.id, ...offStateTargeting })),
          });
          return created;
        }),
      `Environment ${input.key} already exists in project ${project.key}`,
    );
    return toEnvironmentDto(project, environment);
  }

  async update(projectKey: string, key: string, input: UpdateEnvironmentDto): Promise<EnvironmentDto> {
    const project = await this.projects.find(projectKey);
    const environment = await this.find(project, key);
    assertKeyUnchanged('environment', environment.key, input.key);
    assertKeyUnchanged('SDK', environment.sdkKey, input.sdkKey);
    const updated = await this.prisma.environment.update({
      where: { id: environment.id },
      data: { name: input.name },
    });
    return toEnvironmentDto(project, updated);
  }

  /** Deletes the environment with the targeting of every flag in it. */
  async delete(projectKey: string, key: string): Promise<void> {
    const project = await this.projects.find(projectKey);
    const environment = await this.find(project, key);
    // Under the project lock, so a flag being created can't write targeting for this environment meanwhile.
    await this.prisma.$transaction(async (tx) => {
      if (!(await lockProject(tx, project.id))) throw projectNotFound(project.key);
      await tx.environment.deleteMany({ where: { id: environment.id } });
    });
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
