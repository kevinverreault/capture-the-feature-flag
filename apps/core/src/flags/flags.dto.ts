import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ImmutableKey, IsKey, IsName } from '../common/keys.js';

const tagPattern = /^\S(?:.*\S)?$/;

function IsDescription(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ required: false, maxLength: 2000, description: 'What the flag controls.' }),
    IsOptional(),
    IsString(),
    MaxLength(2000),
  );
}

function IsTags(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ required: false, type: [String], example: ['alerts'], maxItems: 50 }),
    IsOptional(),
    IsArray(),
    ArrayMaxSize(50),
    ArrayUnique(),
    IsString({ each: true }),
    MaxLength(64, { each: true }),
    Matches(tagPattern, { each: true, message: 'tags must be non-blank without leading or trailing spaces' }),
  );
}

export class CreateFlagDto {
  @IsKey('flag')
  key!: string;

  @IsName('flag')
  name!: string;

  @IsDescription()
  description?: string;

  @IsTags()
  tags?: string[];
}

export class UpdateFlagDto {
  @ApiProperty({ description: 'The version this edit is based on. An outdated version is rejected with 409.' })
  @IsInt()
  @Min(1)
  version!: number;

  @ImmutableKey('flag')
  key?: never;

  @IsName('flag', { optional: true })
  name?: string;

  @IsDescription()
  description?: string;

  @IsTags()
  tags?: string[];
}

export class FlagDto {
  @ApiProperty({ example: 'birdwatch' })
  projectKey!: string;

  @ApiProperty({ example: 'rare-bird-alerts' })
  key!: string;

  @ApiProperty({ example: 'Rare bird alerts' })
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({
    type: [Boolean],
    example: [true, false],
    description: 'The ordered variations; targeting refers to them by index. Boolean flags are always [true, false].',
  })
  variations!: boolean[];

  @ApiProperty({ description: 'Incremented on every edit; send it back with the next edit.' })
  version!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
