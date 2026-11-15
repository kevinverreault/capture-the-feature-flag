import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/** How many of the project's flags have targeting on and off in one environment. */
export class EnvironmentFlagCountsDto {
  @ApiProperty({ example: 'production' })
  environmentKey!: string;

  @ApiProperty({ example: 'Production' })
  name!: string;

  @ApiProperty({ description: 'Flags (not archived) with targeting on in the environment.' })
  on!: number;

  @ApiProperty({ description: 'Flags (not archived) with targeting off in the environment.' })
  off!: number;
}

/** The project's flag counts, and how many are on and off in each environment. */
export class DashboardSummaryDto {
  @ApiProperty({ description: 'The flags of the project, archived flags left out.' })
  flagCount!: number;

  @ApiProperty({ description: 'The archived flags of the project.' })
  archivedFlagCount!: number;

  @ApiProperty({
    type: [EnvironmentFlagCountsDto],
    description: "Every environment of the project, in the environments' order.",
  })
  environments!: EnvironmentFlagCountsDto[];
}

/** The time ranges the dashboard charts evaluations over, and the size of their buckets in minutes. */
export const evaluationRanges = {
  '24h': { days: 1, bucketMinutes: 60 },
  '7d': { days: 7, bucketMinutes: 6 * 60 },
} as const;

export type EvaluationRange = keyof typeof evaluationRanges;

export class EvaluationSeriesQueryDto {
  @ApiProperty({
    required: false,
    enum: Object.keys(evaluationRanges),
    enumName: 'EvaluationRange',
    default: '24h',
    description: 'The last 24 hours, in hourly buckets, or the last 7 days, in 6-hour buckets.',
  })
  @IsOptional()
  @IsIn(Object.keys(evaluationRanges), { message: 'range must be 24h or 7d' })
  range?: EvaluationRange;

  @ApiProperty({ required: false, description: 'Only this environment.' })
  @IsOptional()
  @IsString()
  environment?: string;
}

/** The evaluations of one flag that served one variation in one environment, within one bucket. */
export class EvaluationSeriesCountDto {
  @ApiProperty({ description: 'The start of the bucket.' })
  start!: Date;

  @ApiProperty({ example: 'rare-bird-alerts' })
  flagKey!: string;

  @ApiProperty({ example: 'production' })
  environmentKey!: string;

  @ApiProperty({ description: 'Index into the flag variations.' })
  variationIndex!: number;

  @ApiProperty({ description: 'Never 0: buckets without evaluations are left out.' })
  count!: number;
}

/**
 * The evaluations of a time range, summed into buckets of the same size from `from` to `to`. The last bucket is the
 * current one, still filling, so there is one bucket more than the range holds, and the whole range is covered.
 */
export class EvaluationSeriesDto {
  @ApiProperty({ enum: Object.keys(evaluationRanges), enumName: 'EvaluationRange' })
  range!: EvaluationRange;

  @ApiProperty({ nullable: true, type: String, description: 'The environment asked for, or null for all of them.' })
  environmentKey!: string | null;

  @ApiProperty({ description: 'The size of each bucket, in minutes.', example: 60 })
  bucketMinutes!: number;

  @ApiProperty({ description: 'The start of the first bucket.' })
  from!: Date;

  @ApiProperty({ description: 'The end of the last bucket, exclusive: it is in the future.' })
  to!: Date;

  @ApiProperty({
    type: [EvaluationSeriesCountDto],
    description: 'Oldest first, then by environment, flag and variation; only buckets with evaluations.',
  })
  counts!: EvaluationSeriesCountDto[];
}

/** A flag without evaluations in any environment for the stale-flag threshold. */
export class StaleFlagDto {
  @ApiProperty({ example: 'rare-bird-alerts' })
  key!: string;

  @ApiProperty({ example: 'Rare bird alerts' })
  name!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({
    nullable: true,
    type: Date,
    description:
      'The start of the last minute it was evaluated in, in any environment, or null when the count buckets kept ' +
      '(see the metric retention) have none.',
  })
  lastEvaluatedAt!: Date | null;
}

/** The project's stale flags, and the threshold from the settings they were found with. */
export class StaleFlagsDto {
  @ApiProperty({ description: 'The stale-flag threshold of the settings, in days.', example: 7 })
  thresholdDays!: number;

  @ApiProperty({
    type: [StaleFlagDto],
    description: 'Never evaluated first, then the longest without evaluations; then by key.',
  })
  flags!: StaleFlagDto[];
}
