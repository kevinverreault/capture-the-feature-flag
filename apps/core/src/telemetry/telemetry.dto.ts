import type { Context, EnvironmentTelemetry, EvaluationCount, SeenContext, TelemetryBatch } from '@ctff/evaluation';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsOmittable } from '../common/keys.js';

// The shared telemetry types from @ctff/evaluation, with their validation and OpenAPI descriptions. `implements`
// keeps them in step.

/** Bounds each list in a batch, so one request can't hold the database for long. */
const maxEntries = 100_000;
/** The longest time range the count buckets are listed for: the dashboard's longest chart. */
export const maxCountRangeDays = 7;
/** How many seen contexts are listed at most, and by default. */
const maxSeenContextsListed = 1000;
export const defaultSeenContextsListed = 100;
/** The most evaluations one count may report: far beyond any Evaluator's minute, and well inside a 4-byte column. */
const maxCount = 1_000_000_000;

export class ContextDto implements Context {
  @ApiProperty({ required: false, description: 'Any non-empty string.', example: 'alice' })
  @IsOmittable()
  @IsString()
  @IsNotEmpty()
  user_id?: string;

  @ApiProperty({ required: false, description: 'An ISO 3166-1 alpha-2 code, in any case.', example: 'CA' })
  @IsOmittable()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'country must be an ISO 3166-1 alpha-2 code' })
  country?: string;
}

export class EvaluationCountDto implements EvaluationCount {
  @ApiProperty({ example: 'rare-bird-alerts' })
  @IsString()
  @IsNotEmpty()
  flagKey!: string;

  @ApiProperty({ description: 'Index into the flag variations.', minimum: 0, type: 'integer' })
  @IsInt()
  @Min(0)
  variationIndex!: number;

  @ApiProperty({ description: 'The start of the minute; seconds are ignored.', example: '2026-11-15T12:34:00.000Z' })
  @IsISO8601({ strict: true })
  minute!: string;

  @ApiProperty({ minimum: 1, maximum: maxCount, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(maxCount)
  count!: number;
}

export class SeenContextDto implements SeenContext {
  @ApiProperty({ type: ContextDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ContextDto)
  context!: ContextDto;

  @ApiProperty({ example: '2026-11-15T12:34:56.789Z' })
  @IsISO8601({ strict: true })
  lastSeen!: string;
}

export class EnvironmentTelemetryDto implements EnvironmentTelemetry {
  @ApiProperty({ description: 'The SDK key of the environment. Telemetry for an unknown one is skipped.' })
  @IsString()
  sdkKey!: string;

  @ApiProperty({ type: [EvaluationCountDto] })
  @IsArray()
  @ArrayMaxSize(maxEntries)
  @ValidateNested({ each: true })
  @Type(() => EvaluationCountDto)
  counts!: EvaluationCountDto[];

  @ApiProperty({ type: [SeenContextDto] })
  @IsArray()
  @ArrayMaxSize(maxEntries)
  @ValidateNested({ each: true })
  @Type(() => SeenContextDto)
  seenContexts!: SeenContextDto[];
}

export class TelemetryBatchDto implements TelemetryBatch {
  @ApiProperty({ type: [EnvironmentTelemetryDto] })
  @IsArray()
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => EnvironmentTelemetryDto)
  environments!: EnvironmentTelemetryDto[];
}

/** One stored count bucket. */
export class EvaluationCountBucketDto {
  @ApiProperty({ example: 'rare-bird-alerts' })
  flagKey!: string;

  @ApiProperty({ example: 'production' })
  environmentKey!: string;

  @ApiProperty({ description: 'Index into the flag variations.' })
  variationIndex!: number;

  @ApiProperty({ description: 'The start of the minute.' })
  minute!: Date;

  @ApiProperty()
  count!: number;
}

export class EvaluationCountsQueryDto {
  @ApiProperty({ required: false, description: 'Only this environment.' })
  @IsOptional()
  @IsString()
  environment?: string;

  @ApiProperty({
    required: false,
    description: `From this moment, inclusive. Defaults to 24 hours before \`to\`; at most ${maxCountRangeDays} days before it.`,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiProperty({ required: false, description: 'Until this moment, exclusive. Defaults to now.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class SeenContextsQueryDto {
  @ApiProperty({
    required: false,
    minimum: 1,
    maximum: maxSeenContextsListed,
    default: defaultSeenContextsListed,
    description: 'How many of the most recently seen to list.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(maxSeenContextsListed)
  limit?: number;

  @ApiProperty({
    required: false,
    description: 'Only the contexts whose `user_id` contains this text, ignoring case.',
    example: 'alice',
  })
  @IsOptional()
  @IsString()
  userId?: string;
}

/** One stored seen context. */
export class StoredSeenContextDto {
  @ApiProperty({ type: ContextDto, description: 'Its context attributes; `country` in uppercase.' })
  context!: ContextDto;

  @ApiProperty()
  lastSeen!: Date;
}
