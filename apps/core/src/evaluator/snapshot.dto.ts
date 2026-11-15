import type { EnvironmentSnapshot, FlagSnapshot, TargetingSnapshot, Variation } from '@ctff/evaluation';
import { ApiProperty } from '@nestjs/swagger';
import { IndividualTargetDto, RuleDto } from '../targeting/targeting.dto.js';

// OpenAPI descriptions of the shared snapshot types from @ctff/evaluation. `implements` keeps them in step.

export class TargetingSnapshotDto implements TargetingSnapshot {
  @ApiProperty()
  on!: boolean;

  @ApiProperty()
  offVariation!: number;

  @ApiProperty()
  defaultVariation!: number;

  @ApiProperty({ type: [IndividualTargetDto] })
  individualTargets!: IndividualTargetDto[];

  @ApiProperty({ type: [RuleDto] })
  rules!: RuleDto[];

  @ApiProperty()
  version!: number;
}

export class FlagSnapshotDto implements FlagSnapshot {
  @ApiProperty()
  key!: string;

  @ApiProperty({ type: [Boolean] })
  variations!: Variation[];

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: TargetingSnapshotDto })
  targeting!: TargetingSnapshotDto;
}

export class EnvironmentSnapshotDto implements EnvironmentSnapshot {
  @ApiProperty()
  projectKey!: string;

  @ApiProperty()
  environmentKey!: string;

  @ApiProperty({ type: [FlagSnapshotDto], description: 'Every flag of the project, ordered by flag key.' })
  flags!: FlagSnapshotDto[];
}
