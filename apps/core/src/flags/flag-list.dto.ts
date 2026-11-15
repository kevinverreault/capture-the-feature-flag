import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
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

/** The flag list's query. */
export class FlagListQueryDto {
  @ApiProperty({
    required: false,
    default: false,
    description: 'Whether to list archived flags too. They are left out by default.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  includeArchived?: boolean;
}
