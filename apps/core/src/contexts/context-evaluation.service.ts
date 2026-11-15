import { evaluate, normalizeContext } from '@ctff/evaluation';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { EnvironmentsService } from '../environments/environments.service.js';
import { loadEnvironmentSnapshot } from '../evaluator/environment-snapshot.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { ContextDto } from '../common/context.dto.js';
import type { ContextEvaluationDto } from './context-evaluation.dto.js';

/**
 * Evaluates every flag for a context, as an Evaluator would: with the shared evaluation library, against the
 * environment's snapshot as Core would serve it now. Nothing is recorded: it is not telemetry.
 */
@Injectable()
export class ContextEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly environments: EnvironmentsService,
  ) {}

  async evaluateAll(projectKey: string, environmentKey: string, input: ContextDto): Promise<ContextEvaluationDto> {
    const project = await this.projects.find(projectKey);
    const environment = await this.environments.find(project, environmentKey);
    // The body was validated already; this only normalizes it (country in uppercase), as evaluate() does.
    const context = normalizeContext({ ...input });
    if (!context) throw new BadRequestException('The context is malformed');
    const { snapshot, flagNames } = await loadEnvironmentSnapshot(this.prisma, project, environment);
    return {
      context,
      flags: snapshot.flags.map(({ key }) => ({
        flagKey: key,
        flagName: flagNames.get(key) ?? key,
        ...evaluate(snapshot, key, context),
      })),
    };
  }
}
