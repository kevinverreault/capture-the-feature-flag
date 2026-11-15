import { contextAttributeKeys, type IndividualTarget, type Rule, ruleOperators } from '@ctff/evaluation';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Min } from 'class-validator';
import { IsOmittable } from '../common/keys.js';

export class IndividualTargetDto implements IndividualTarget {
  @ApiProperty({ description: 'Index into the flag variations.' })
  variation!: number;

  @ApiProperty({ type: [String] })
  userIds!: string[];
}

export class RuleDto implements Rule {
  @ApiProperty({ enum: contextAttributeKeys })
  attribute!: Rule['attribute'];

  @ApiProperty({ enum: ruleOperators })
  operator!: Rule['operator'];

  @ApiProperty({ type: [String] })
  values!: string[];

  @ApiProperty({ description: 'Index into the flag variations.' })
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
}
