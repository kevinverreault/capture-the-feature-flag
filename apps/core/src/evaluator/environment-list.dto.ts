import type { EnvironmentList, EnvironmentListEntry } from '@ctff/evaluation';
import { ApiProperty } from '@nestjs/swagger';

// OpenAPI descriptions of the shared environment list types from @ctff/evaluation. `implements` keeps them in step.

export class EnvironmentListEntryDto implements EnvironmentListEntry {
  @ApiProperty({ example: 'birdwatch' })
  projectKey!: string;

  @ApiProperty({ example: 'production' })
  environmentKey!: string;

  @ApiProperty({ example: 'ctff-env-…' })
  sdkKey!: string;
}

export class EnvironmentListDto implements EnvironmentList {
  @ApiProperty({ type: [EnvironmentListEntryDto], description: 'Every environment of every project, by SDK key.' })
  environments!: EnvironmentListEntryDto[];
}
