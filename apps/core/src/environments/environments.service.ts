import { Injectable, NotFoundException } from '@nestjs/common';
import { environmentState, recordAudit } from '../audit/audit-entry.js';
import { assertKeyUnchanged } from '../common/keys.js';
import { withUniqueKey } from '../common/persistence.js';
import { lockProject } from '../database/lock-project.js';
import { lockRow } from '../database/lock-row.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Environment, Prisma, Project } from '../generated/prisma/client.js';
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
    if (!environment) throw environmentNotFound(project, key);
    return environment;
  }

  /** Creates the environment with off-state targeting for every existing flag of the project. */
  async create(projectKey: string, input: CreateEnvironmentDto, actor: string): Promise<EnvironmentDto> {
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
          await recordAudit(
            tx,
            { type: 'environment', project, environment: created },
            {
              action: 'create',
              actor,
              after: environmentState(created),
            },
          );
          return created;
        }),
      `Environment ${input.key} already exists in project ${project.key}`,
    );
    return toEnvironmentDto(project, environment);
  }

  async update(projectKey: string, key: string, input: UpdateEnvironmentDto, actor: string): Promise<EnvironmentDto> {
    const project = await this.projects.find(projectKey);
    const found = await this.find(project, key);
    assertKeyUnchanged('environment', found.key, input.key);
    assertKeyUnchanged('SDK', found.sdkKey, input.sdkKey, 'sdkKey');
    const updated = await this.prisma.$transaction(async (tx) => {
      const environment = await this.lock(tx, project, found);
      const updated = await tx.environment.update({ where: { id: environment.id }, data: { name: input.name } });
      await recordAudit(
        tx,
        { type: 'environment', project, environment: updated },
        {
          action: 'update',
          actor,
          before: environmentState(environment),
          after: environmentState(updated),
        },
      );
      return updated;
    });
    return toEnvironmentDto(project, updated);
  }

  /** Deletes the environment with the targeting of every flag in it. */
  async delete(projectKey: string, key: string, actor: string): Promise<void> {
    const project = await this.projects.find(projectKey);
    const found = await this.find(project, key);
    // Under the project lock, so a flag being created can't write targeting for this environment meanwhile.
    await this.prisma.$transaction(async (tx) => {
      if (!(await lockProject(tx, project.id))) throw projectNotFound(project.key);
      const environment = await this.lock(tx, project, found);
      await tx.environment.delete({ where: { id: environment.id } });
      await recordAudit(
        tx,
        { type: 'environment', project, environment },
        {
          action: 'delete',
          actor,
          before: environmentState(environment),
        },
      );
    });
  }

  /** Locks the environment's row and reloads it, or fails with 404 when it was deleted meanwhile. */
  private async lock(tx: Prisma.TransactionClient, project: Project, environment: Environment): Promise<Environment> {
    if (!(await lockRow(tx, 'environment', environment.id))) throw environmentNotFound(project, environment.key);
    return tx.environment.findUniqueOrThrow({ where: { id: environment.id } });
  }
}

function environmentNotFound(project: Project, key: string): NotFoundException {
  return new NotFoundException(`Environment ${key} not found in project ${project.key}`);
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
