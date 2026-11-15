import { ApiProperty } from '@nestjs/swagger';
import { FlagDto } from './flags.dto.js';

/** Whether a flag's targeting is on or off in one environment. */
export class TargetingStateDto {
  @ApiProperty({ example: 'production' })
  environmentKey!: string;

  @ApiProperty({ description: 'Targeting on or off. While off, every context gets the off variation.' })
  on!: boolean;
}

/** A flag as the flag list shows it: the flag, and its targeting on or off in each environment. */
export class FlagListItemDto extends FlagDto {
  @ApiProperty({
    type: [TargetingStateDto],
    description: "The flag's targeting on or off in every environment of the project, in the environments' order.",
  })
  targeting!: TargetingStateDto[];
}
