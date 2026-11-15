import type { Variation } from '@ctff/evaluation';
import { Injectable, NotFoundException } from '@nestjs/common';
import { recordAudit, targetingState } from '../audit/audit-entry.js';
import { updateAtVersion } from '../common/persistence.js';
import { invalidBody } from '../common/validation.js';
import { lockAndReload } from '../database/lock-row.js';
import { PrismaService } from '../database/prisma.service.js';
import { EnvironmentsService } from '../environments/environments.service.js';
import { assertNotArchived, notArchived } from '../flags/archived.js';
import { FlagsService } from '../flags/flags.service.js';
import type { Environment, Flag, Targeting } from '../generated/prisma/client.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { TargetingDto, UpdateTargetingDto } from './targeting.dto.js';
import { checkTargetingChange } from './check-targeting.js';
import { toTargetingJsonColumns, toTargetingSnapshot } from './targeting-snapshot.js';

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
    actor: string,
  ): Promise<TargetingDto> {
    const { project, flag, environment, targeting: found } = await this.find(projectKey, flagKey, environmentKey);
    assertNotArchived(flag);
    const checked = checkTargetingChange(
      {
        offVariation: input.offVariation,
        defaultVariation: input.defaultVariation,
        individualTargets: input.individualTargets,
        rules: input.rules,
      },
      (flag.variations as Variation[]).length,
    );
    if (!checked.valid) throw invalidBody(checked.fields);
    const { offVariation, defaultVariation, individualTargets, rules } = checked.change;
    const updated = await this.prisma.$transaction(async (tx) => {
      const targeting = await lockAndReload(tx, 'targeting', found.id, () =>
        targetingNotFound(flagKey, environmentKey),
      );
      await updateAtVersion(
        () =>
          tx.targeting.updateMany({
            // Also filtered on the flag, so targeting of a flag archived meanwhile is left as it was archived.
            where: { id: targeting.id, version: input.version, flag: notArchived },
            data: {
              on: input.on,
              offVariation,
              defaultVariation,
              ...toTargetingJsonColumns({ individualTargets, rules }),
              version: { increment: 1 },
            },
          }),
        `Targeting of ${flagKey} in ${environmentKey}`,
        input.version,
      );
      const updated = await tx.targeting.findUniqueOrThrow({ where: { id: targeting.id } });
      await recordAudit(
        tx,
        { type: 'targeting', project, flag, environment, targeting: updated },
        {
          action: 'update',
          actor,
          before: targetingState(targeting),
          after: targetingState(updated),
        },
      );
      return updated;
    });
    return toTargetingDto(flag, environment, updated);
  }

  private async find(projectKey: string, flagKey: string, environmentKey: string) {
    const project = await this.projects.find(projectKey);
    const flag = await this.flags.find(project, flagKey);
    const environment = await this.environments.find(project, environmentKey);
    const targeting = await this.prisma.targeting.findUnique({
      where: { flagId_environmentId: { flagId: flag.id, environmentId: environment.id } },
    });
    if (!targeting) throw targetingNotFound(flagKey, environmentKey);
    return { project, flag, environment, targeting };
  }
}

function targetingNotFound(flagKey: string, environmentKey: string): NotFoundException {
  return new NotFoundException(`Flag ${flagKey} has no targeting in ${environmentKey}`);
}

function toTargetingDto(flag: Flag, environment: Environment, targeting: Targeting): TargetingDto {
  return {
    flagKey: flag.key,
    environmentKey: environment.key,
    ...toTargetingSnapshot(targeting),
    updatedAt: targeting.updatedAt,
  };
}
