import {
  type Context,
  evaluationErrorKinds,
  evaluationReasonKinds,
  type EvaluationReason,
  type EvaluationResult,
} from '@ctff/evaluation';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';
import { ContextDto } from '../common/context.dto.js';

export class EvaluateContextDto {
  @ApiProperty({ type: ContextDto, description: 'The context to evaluate every flag for.' })
  @IsObject({ message: 'context must be an object' })
  @ValidateNested()
  @Type(() => ContextDto)
  context!: ContextDto;
}

/** Why an evaluation produced its variation (`EvaluationReason` from @ctff/evaluation). */
export class EvaluationReasonDto {
  @ApiProperty({ enum: evaluationReasonKinds, enumName: 'EvaluationReasonKind' })
  kind!: EvaluationReason['kind'];

  @ApiProperty({
    required: false,
    type: 'integer',
    description: 'For `RULE_MATCH`: the index, in the targeting’s ordered rules, of the first rule that matched.',
  })
  ruleIndex?: number;

  @ApiProperty({
    required: false,
    enum: evaluationErrorKinds,
    enumName: 'EvaluationErrorKind',
    description: 'For `ERROR`: what went wrong.',
  })
  errorKind?: (typeof evaluationErrorKinds)[number];
}

/** What one flag serves the context. */
export class FlagContextEvaluationDto {
  @ApiProperty({ example: 'rare-bird-alerts' })
  flagKey!: string;

  @ApiProperty({ example: 'Rare bird alerts' })
  flagName!: string;

  @ApiProperty({ type: Boolean, nullable: true, description: 'The variation served; null for an error.' })
  value!: EvaluationResult['value'];

  @ApiProperty({ type: 'integer', nullable: true, description: 'Index into the flag variations; null for an error.' })
  variationIndex!: EvaluationResult['variationIndex'];

  @ApiProperty({ type: EvaluationReasonDto })
  reason!: EvaluationReasonDto;
}

export class ContextEvaluationDto {
  @ApiProperty({
    type: ContextDto,
    description: 'The context evaluated, as evaluations see it: `country` in uppercase.',
  })
  context!: Context;

  @ApiProperty({
    type: [FlagContextEvaluationDto],
    description: 'Every flag of the project that is not archived, ordered by flag key.',
  })
  flags!: FlagContextEvaluationDto[];
}
