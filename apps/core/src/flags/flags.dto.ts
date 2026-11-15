import type { Variation } from '@ctff/evaluation';
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
import { ImmutableKey, IsKey, IsName, IsOmittable, keyMaxLength, keyPattern } from '../common/keys.js';

const tagPattern = /^\S(?:.*\S)?$/;

function IsDescription(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ required: false, maxLength: 2000, description: 'What the flag controls.' }),
    IsOmittable(),
    IsString(),
    MaxLength(2000),
  );
}

function IsTags(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ required: false, type: [String], example: ['alerts'], maxItems: 50 }),
    IsOmittable(),
    IsArray(),
    ArrayMaxSize(50),
    ArrayUnique(),
    IsString({ each: true }),
    MaxLength(64, { each: true }),
    Matches(tagPattern, { each: true, message: 'tags must be non-blank without leading or trailing spaces' }),
  );
}

const managedByDescription =
  'The tool that manages the flag as code, in lowercase kebab-case (the Terraform provider sets "terraform"). ' +
  'The admin app shows a badge and warns before edits. It is informational: it does not lock the flag.';

/** The "managed by" marker. An update may also send null, handing the flag back to manual management. */
function IsManagedBy({ nullable }: { nullable: boolean }): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      required: false,
      nullable,
      type: String,
      description: nullable ? `${managedByDescription} Send null to clear it.` : managedByDescription,
      pattern: keyPattern.source,
      maxLength: keyMaxLength,
      example: 'terraform',
    }),
    nullable ? IsOptional() : IsOmittable(),
    IsString(),
    MaxLength(keyMaxLength),
    Matches(keyPattern, { message: 'managedBy must be lowercase kebab-case (e.g. terraform)' }),
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

  @IsManagedBy({ nullable: false })
  managedBy?: string;
}

export class UpdateFlagDto {
  @ApiProperty({ description: 'The version this edit is based on. An outdated version is rejected with 409.' })
  @IsInt()
  @Min(1)
  version!: number;

  @ImmutableKey('flag')
  key?: string;

  @IsName('flag', { optional: true })
  name?: string;

  @IsDescription()
  description?: string;

  @IsTags()
  tags?: string[];

  @IsManagedBy({ nullable: true })
  managedBy?: string | null;
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
  variations!: Variation[];

  @ApiProperty({ description: 'Incremented on every edit; send it back with the next edit.' })
  version!: number;

  @ApiProperty({ type: String, nullable: true, description: managedByDescription, example: 'terraform' })
  managedBy!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
