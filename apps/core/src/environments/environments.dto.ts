import { ApiProperty } from '@nestjs/swagger';
import { ImmutableKey, IsKey, IsName } from '../common/keys.js';

export class CreateEnvironmentDto {
  @IsKey('environment')
  key!: string;

  @IsName('environment')
  name!: string;
}

export class UpdateEnvironmentDto {
  @ImmutableKey('environment')
  key?: never;

  @ImmutableKey('SDK')
  sdkKey?: never;

  @IsName('environment', { optional: true })
  name?: string;
}

export class EnvironmentDto {
  @ApiProperty({ example: 'birdwatch' })
  projectKey!: string;

  @ApiProperty({ example: 'production' })
  key!: string;

  @ApiProperty({ example: 'Production' })
  name!: string;

  @ApiProperty({
    description: 'The opaque, generated key an SDK uses to say which environment it evaluates in.',
    example: 'ctff-env-3q2xJ0bS9yqgk1WkR7cN5hTzL0aV',
  })
  sdkKey!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
