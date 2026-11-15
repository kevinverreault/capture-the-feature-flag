import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';
import { IsOmittable } from '../common/keys.js';
import { AuditAction, AuditTargetType } from '../generated/prisma/enums.js';

/** What an audit entry can be about: the values of the AuditTargetType enum in schema.prisma, read from it. */
const auditTargetTypes = Object.values(AuditTargetType);
/** What can be done to an audit entry's target: the values of the AuditAction enum in schema.prisma, read from it. */
const auditActions = Object.values(AuditAction);
const auditPageMaxSize = 200;
const auditPageDefaultSize = 50;

/** The query of the audit entry list: its filters and the page wanted. */
export class ListAuditEntriesQuery {
  @ApiProperty({ required: false, description: 'Only the entries of this project.' })
  @IsOmittable()
  @IsString()
  projectKey?: string;

  @ApiProperty({
    required: false,
    description: "Only the entries of this flag of the project (projectKey is required), including its targeting's.",
  })
  @IsOmittable()
  @IsString()
  flagKey?: string;

  @ApiProperty({
    required: false,
    type: 'integer',
    description: 'The nextCursor of the previous page: only entries older than it.',
  })
  @IsOmittable()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;

  @ApiProperty({
    required: false,
    type: 'integer',
    minimum: 1,
    maximum: auditPageMaxSize,
    default: auditPageDefaultSize,
    description: 'How many entries to return at most.',
  })
  @IsOmittable()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(auditPageMaxSize)
  limit: number = auditPageDefaultSize;
}

const stateSchema = {
  type: 'object',
  nullable: true,
  additionalProperties: true,
} as const;

/** An audit entry: what changed (target and action), who changed it, when, and its state before and after. */
export class AuditEntryDto {
  @ApiProperty({ description: 'Increases with every entry: a higher id is a later entry.' })
  id!: number;

  @ApiProperty({ example: 'birdwatch' })
  projectKey!: string;

  @ApiProperty({ enum: auditTargetTypes, enumName: 'AuditTargetType' })
  targetType!: AuditTargetType;

  @ApiProperty({ format: 'uuid', description: 'The id of the project, environment, flag or targeting changed.' })
  targetId!: string;

  @ApiProperty({ nullable: true, type: String, description: 'The flag of a flag or targeting entry.' })
  flagKey!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'The environment of an environment or targeting entry.' })
  environmentKey!: string | null;

  @ApiProperty({ enum: auditActions, enumName: 'AuditAction' })
  action!: AuditAction;

  @ApiProperty({ description: 'Who made the change, from the X-CTFF-Actor header.', example: 'anonymous' })
  actor!: string;

  @ApiProperty({ ...stateSchema, description: 'The target before the change; null for a create.' })
  before!: Record<string, unknown> | null;

  @ApiProperty({ ...stateSchema, description: 'The target after the change; null for a delete.' })
  after!: Record<string, unknown> | null;

  @ApiProperty()
  createdAt!: Date;
}

/** A page of audit entries, newest first, and the cursor of the next (older) page. */
export class AuditEntryPageDto {
  @ApiProperty({ type: [AuditEntryDto], description: 'Newest first.' })
  entries!: AuditEntryDto[];

  @ApiProperty({
    nullable: true,
    type: 'integer',
    description: 'The cursor of the next (older) page, or null when this is the last one.',
  })
  nextCursor!: number | null;
}
