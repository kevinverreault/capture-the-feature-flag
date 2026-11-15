import { Injectable, NotFoundException } from '@nestjs/common';
import { projectState, recordAudit } from '../audit/audit-entry.js';
import { assertKeyUnchanged } from '../common/keys.js';
import { withUniqueKey } from '../common/persistence.js';
import { lockAndReload } from '../database/lock-row.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Project } from '../generated/prisma/client.js';
import type { CreateProjectDto, ProjectDto, UpdateProjectDto } from './projects.dto.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ProjectDto[]> {
    const projects = await this.prisma.project.findMany({ orderBy: { key: 'asc' } });
    return projects.map(toProjectDto);
  }

  async get(key: string): Promise<ProjectDto> {
    return toProjectDto(await this.find(key));
  }

  /** Loads a project by key, or fails with 404. */
  async find(key: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { key } });
    if (!project) throw projectNotFound(key);
    return project;
  }

  async create(input: CreateProjectDto, actor: string): Promise<ProjectDto> {
    const project = await withUniqueKey(
      () =>
        this.prisma.$transaction(async (tx) => {
          const created = await tx.project.create({ data: { key: input.key, name: input.name } });
          await recordAudit(
            tx,
            { type: 'project', project: created },
            {
              action: 'create',
              actor,
              after: projectState(created),
            },
          );
          return created;
        }),
      `Project ${input.key} already exists`,
    );
    return toProjectDto(project);
  }

  async update(key: string, input: UpdateProjectDto, actor: string): Promise<ProjectDto> {
    const found = await this.find(key);
    assertKeyUnchanged('project', found.key, input.key);
    const updated = await this.prisma.$transaction(async (tx) => {
      const project = await lockAndReload(tx, 'project', found.id, () => projectNotFound(key));
      const updated = await tx.project.update({ where: { id: project.id }, data: { name: input.name } });
      await recordAudit(
        tx,
        { type: 'project', project: updated },
        {
          action: 'update',
          actor,
          before: projectState(project),
          after: projectState(updated),
        },
      );
      return updated;
    });
    return toProjectDto(updated);
  }

  /** Deletes the project with its environments, flags and targeting. */
  async delete(key: string, actor: string): Promise<void> {
    const found = await this.find(key);
    await this.prisma.$transaction(async (tx) => {
      const project = await lockAndReload(tx, 'project', found.id, () => projectNotFound(key));
      await tx.project.delete({ where: { id: project.id } });
      await recordAudit(tx, { type: 'project', project }, { action: 'delete', actor, before: projectState(project) });
    });
  }
}

/** The 404 for a project that doesn't exist (or no longer does). */
export function projectNotFound(key: string): NotFoundException {
  return new NotFoundException(`Project ${key} not found`);
}

function toProjectDto(project: Project): ProjectDto {
  return { key: project.key, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt };
}
