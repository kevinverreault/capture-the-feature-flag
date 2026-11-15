import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isUniqueViolation } from '../common/prisma-errors.js';
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
    if (!project) throw new NotFoundException(`Project ${key} not found`);
    return project;
  }

  async create(input: CreateProjectDto): Promise<ProjectDto> {
    try {
      return toProjectDto(await this.prisma.project.create({ data: { key: input.key, name: input.name } }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`Project ${input.key} already exists`);
      throw error;
    }
  }

  async update(key: string, input: UpdateProjectDto): Promise<ProjectDto> {
    const project = await this.find(key);
    const updated = await this.prisma.project.update({ where: { id: project.id }, data: { name: input.name } });
    return toProjectDto(updated);
  }

  /** Deletes the project with its environments, flags and targeting. */
  async delete(key: string): Promise<void> {
    const { count } = await this.prisma.project.deleteMany({ where: { key } });
    if (count === 0) throw new NotFoundException(`Project ${key} not found`);
  }
}

function toProjectDto(project: Project): ProjectDto {
  return { key: project.key, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt };
}
