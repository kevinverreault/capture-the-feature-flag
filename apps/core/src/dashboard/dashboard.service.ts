import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { archived, notArchived } from '../flags/archived.js';
import { ProjectsService } from '../projects/projects.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { EnvironmentsService } from '../environments/environments.service.js';
import { dayMs } from '../telemetry/time.js';
import {
  type DashboardSummaryDto,
  type EvaluationRange,
  evaluationRanges,
  type EvaluationSeriesDto,
  type EvaluationSeriesQueryDto,
  type StaleFlagsDto,
} from './dashboard.dto.js';

interface SeriesRow {
  start: Date;
  flagKey: string;
  environmentKey: string;
  variationIndex: number;
  count: bigint;
}

const minuteMs = 60_000;

/** What the admin app's dashboard shows of a project. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly environments: EnvironmentsService,
    private readonly settings: SettingsService,
  ) {}

  /** The project's flag counts, and how many of its flags are on and off in each environment. */
  async summary(projectKey: string): Promise<DashboardSummaryDto> {
    const project = await this.projects.find(projectKey);
    const [flagCount, archivedFlagCount, environments, states] = await Promise.all([
      this.prisma.flag.count({ where: { projectId: project.id, ...notArchived } }),
      this.prisma.flag.count({ where: { projectId: project.id, ...archived } }),
      this.prisma.environment.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, key: true, name: true },
      }),
      this.prisma.targeting.groupBy({
        by: ['environmentId', 'on'],
        where: { flag: { projectId: project.id, ...notArchived } },
        _count: { _all: true },
      }),
    ]);
    const count = (environmentId: string, on: boolean) =>
      states.find((row) => row.environmentId === environmentId && row.on === on)?._count._all ?? 0;
    return {
      flagCount,
      archivedFlagCount,
      environments: environments.map((environment) => ({
        environmentKey: environment.key,
        name: environment.name,
        on: count(environment.id, true),
        off: count(environment.id, false),
      })),
    };
  }

  /**
   * The evaluations of the range (default: the last 24 hours), of every flag of the project or of one environment,
   * summed per bucket, flag, environment and variation. Buckets are aligned on UTC (whole hours, or 00:00, 06:00,
   * 12:00 and 18:00), and the last one is the current one, so the latest counts are in.
   */
  async evaluations(projectKey: string, query: EvaluationSeriesQueryDto): Promise<EvaluationSeriesDto> {
    const project = await this.projects.find(projectKey);
    const environment = query.environment ? await this.environments.find(project, query.environment) : undefined;
    const range: EvaluationRange = query.range ?? '24h';
    const { days, bucketMinutes } = evaluationRanges[range];
    const bucketMs = bucketMinutes * minuteMs;
    const to = new Date((Math.floor(Date.now() / bucketMs) + 1) * bucketMs);
    const from = new Date(to.getTime() - days * dayMs);
    const environmentId = environment?.id ?? null;

    const rows = await this.prisma.$queryRaw<SeriesRow[]>`
      SELECT date_bin(${`${bucketMinutes} minutes`}::interval, c.minute, ${from}::timestamptz) AS start,
             f.key AS "flagKey", e.key AS "environmentKey", c.variation_index AS "variationIndex",
             SUM(c.count)::bigint AS count
        FROM evaluation_counts c
        JOIN environments e ON e.id = c.environment_id
        JOIN flags f ON f.id = c.flag_id
       WHERE e.project_id = ${project.id}::uuid
         AND (${environmentId}::uuid IS NULL OR e.id = ${environmentId}::uuid)
         AND c.minute >= ${from} AND c.minute < ${to}
       GROUP BY 1, 2, 3, 4
       ORDER BY 1, 3, 2, 4`;
    return {
      range,
      environmentKey: environment?.key ?? null,
      bucketMinutes,
      from,
      to,
      counts: rows.map((row) => ({
        start: row.start,
        flagKey: row.flagKey,
        environmentKey: row.environmentKey,
        variationIndex: row.variationIndex,
        count: Number(row.count),
      })),
    };
  }

  /**
   * The flags of the project (archived flags left out) with no evaluations in any environment for the stale-flag
   * threshold of the settings. A flag younger than the threshold is not stale yet, evaluated or not.
   */
  async staleFlags(projectKey: string): Promise<StaleFlagsDto> {
    const project = await this.projects.find(projectKey);
    const { staleFlagThresholdDays } = await this.settings.get();
    const since = new Date(Date.now() - staleFlagThresholdDays * dayMs);
    const flags = await this.prisma.flag.findMany({
      where: { projectId: project.id, ...notArchived, createdAt: { lte: since } },
      select: { id: true, key: true, name: true, createdAt: true },
    });
    const lastEvaluations = await this.prisma.evaluationCount.groupBy({
      by: ['flagId'],
      where: { flagId: { in: flags.map((flag) => flag.id) } },
      _max: { minute: true },
    });
    const lastEvaluated = new Map(lastEvaluations.map((row) => [row.flagId, row._max.minute]));
    const stale = flags
      .map(({ id, ...flag }) => ({ ...flag, lastEvaluatedAt: lastEvaluated.get(id) ?? null }))
      .filter((flag) => flag.lastEvaluatedAt === null || flag.lastEvaluatedAt < since)
      // Never evaluated first, then the longest without evaluations.
      .sort(
        (a, b) =>
          (a.lastEvaluatedAt?.getTime() ?? -Infinity) - (b.lastEvaluatedAt?.getTime() ?? -Infinity) ||
          (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
      );
    return { thresholdDays: staleFlagThresholdDays, flags: stale };
  }
}
