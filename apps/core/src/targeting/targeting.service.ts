import type { IndividualTarget, Rule } from '@ctff/evaluation';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { EnvironmentsService } from '../environments/environments.service.js';
import { FlagsService, staleVersion } from '../flags/flags.service.js';
import type { Environment, Flag, Targeting } from '../generated/prisma/client.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { TargetingDto, UpdateTargetingDto } from './targeting.dto.js';

@Injectable()
export class TargetingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly environments: EnvironmentsService,
    private readonly flags: FlagsService,
  ) {}

  /** The flag's targeting in every environment of its project. */
  async list(projectKey: string, flagKey: string): Promise<TargetingDto[]> {
    const project = await this.projects.find(projectKey);
    const flag = await this.flags.find(project, flagKey);
    const targeting = await this.prisma.targeting.findMany({
      where: { flagId: flag.id },
      include: { environment: true },
      orderBy: { environment: { createdAt: 'asc' } },
    });
    return targeting.map((row) => toTargetingDto(flag, row.environment, row));
  }

  async get(projectKey: string, flagKey: string, environmentKey: string): Promise<TargetingDto> {
    const { flag, environment, targeting } = await this.find(projectKey, flagKey, environmentKey);
    return toTargetingDto(flag, environment, targeting);
  }

  /** Applies a change based on `input.version`; targeting changed since then is rejected with 409. */
  async update(
    projectKey: string,
    flagKey: string,
    environmentKey: string,
    input: UpdateTargetingDto,
  ): Promise<TargetingDto> {
    const { flag, environment, targeting } = await this.find(projectKey, flagKey, environmentKey);
    const { count } = await this.prisma.targeting.updateMany({
      where: { id: targeting.id, version: input.version },
      data: { on: input.on, version: { increment: 1 } },
    });
    if (count === 0) throw staleVersion(`Targeting of ${flagKey} in ${environmentKey}`, input.version);
    const updated = await this.prisma.targeting.findUniqueOrThrow({ where: { id: targeting.id } });
    return toTargetingDto(flag, environment, updated);
  }

  private async find(projectKey: string, flagKey: string, environmentKey: string) {
    const project = await this.projects.find(projectKey);
    const flag = await this.flags.find(project, flagKey);
    const environment = await this.environments.find(project, environmentKey);
    const targeting = await this.prisma.targeting.findUnique({
      where: { flagId_environmentId: { flagId: flag.id, environmentId: environment.id } },
    });
    if (!targeting) throw new NotFoundException(`Flag ${flagKey} has no targeting in ${environmentKey}`);
    return { flag, environment, targeting };
  }
}

function toTargetingDto(flag: Flag, environment: Environment, targeting: Targeting): TargetingDto {
  return {
    flagKey: flag.key,
    environmentKey: environment.key,
    on: targeting.on,
    offVariation: targeting.offVariation,
    defaultVariation: targeting.defaultVariation,
    individualTargets: targeting.individualTargets as unknown as IndividualTarget[],
    rules: targeting.rules as unknown as Rule[],
    version: targeting.version,
    updatedAt: targeting.updatedAt,
  };
}
