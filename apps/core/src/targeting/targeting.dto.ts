import { contextAttributeKeys, type IndividualTarget, type Rule, ruleOperators } from '@ctff/evaluation';
import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsOmittable } from '../common/keys.js';

/** Limits that keep one targeting (and so every snapshot) a reasonable size. */
const maxRules = 100;
const maxListedValues = 1000;
const maxValueLength = 256;

/**
 * An index into the flag's variations. Whether the flag has that variation is checked against the flag itself,
 * by `checkTargeting`.
 */
function IsVariationIndex(description: string, { optional = false } = {}): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      type: 'integer',
      description: `Index into the flag variations ${description}.`,
      minimum: 0,
      required: !optional,
    }),
    ...(optional ? [IsOmittable()] : []),
    IsInt({ message: '$property must be a variation index (an integer)' }),
    Min(0, { message: '$property must be a variation index (0 or more)' }),
  );
}

/** A list of strings, such as user IDs or the values of a rule. */
function IsStringList(description: string, { nonEmpty = false } = {}): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ type: [String], description, maxItems: maxListedValues, ...(nonEmpty ? { minItems: 1 } : {}) }),
    IsArray(),
    ...(nonEmpty ? [ArrayNotEmpty({ message: '$property must list at least one value' })] : []),
    ArrayMaxSize(maxListedValues),
    IsString({ each: true }),
    MaxLength(maxValueLength, { each: true }),
  );
}

export class IndividualTargetDto implements IndividualTarget {
  @IsVariationIndex('served to the listed user IDs')
  variation!: number;

  @IsStringList('The user IDs always served this variation while targeting is on. Each is a non-empty string.')
  @MinLength(1, { each: true, message: 'user IDs must be non-empty strings' })
  userIds!: string[];
}

export class RuleDto implements Rule {
  @ApiProperty({ enum: contextAttributeKeys, description: 'The context attribute the rule tests.' })
  @IsIn(contextAttributeKeys)
  attribute!: Rule['attribute'];

  @ApiProperty({
    enum: ruleOperators,
    description:
      'in: the attribute is one of the values. not_in: it is none of them. A missing attribute never matches.',
  })
  @IsIn(ruleOperators)
  operator!: Rule['operator'];

  @IsStringList('For country, ISO 3166-1 alpha-2 codes (stored in uppercase); for user_id, non-empty user IDs.', {
    nonEmpty: true,
  })
  values!: string[];

  @IsVariationIndex('served when the rule matches')
  variation!: number;
}

export class TargetingDto {
  @ApiProperty({ example: 'rare-bird-alerts' })
  flagKey!: string;

  @ApiProperty({ example: 'production' })
  environmentKey!: string;

  @ApiProperty({ description: 'Targeting on or off. While off, every context gets the off variation.' })
  on!: boolean;

  @ApiProperty({ description: 'Index into the flag variations served while targeting is off.' })
  offVariation!: number;

  @ApiProperty({ description: 'Index into the flag variations served when no individual target or rule matches.' })
  defaultVariation!: number;

  @ApiProperty({ type: [IndividualTargetDto] })
  individualTargets!: IndividualTargetDto[];

  @ApiProperty({ type: [RuleDto], description: 'Ordered; the first rule that matches wins.' })
  rules!: RuleDto[];

  @ApiProperty({ description: 'Incremented on every change; send it back with the next change.' })
  version!: number;

  @ApiProperty()
  updatedAt!: Date;
}

export class UpdateTargetingDto {
  @ApiProperty({ description: 'The version this change is based on. An outdated version is rejected with 409.' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ required: false, description: 'Switch targeting on or off.' })
  @IsOmittable()
  @IsBoolean()
  on?: boolean;

  @IsVariationIndex('served while targeting is off', { optional: true })
  offVariation?: number;

  @IsVariationIndex('served when targeting is on and no individual target or rule matches', { optional: true })
  defaultVariation?: number;

  @ApiProperty({
    type: [IndividualTargetDto],
    required: false,
    maxItems: maxRules,
    description: 'Replaces the individual targets. At most one per variation, and a user ID in only one of them.',
  })
  @IsOmittable()
  @IsArray()
  @ArrayMaxSize(maxRules)
  @ValidateNested({ each: true })
  @Type(() => IndividualTargetDto)
  individualTargets?: IndividualTargetDto[];

  @ApiProperty({
    type: [RuleDto],
    required: false,
    maxItems: maxRules,
    description: 'Replaces the rules. Ordered; the first rule that matches wins.',
  })
  @IsOmittable()
  @IsArray()
  @ArrayMaxSize(maxRules)
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules?: RuleDto[];
}
