import { ApiProperty } from '@nestjs/swagger';
import { ImmutableKey, IsKey, IsName } from '../common/keys.js';

export class CreateProjectDto {
  @IsKey('project')
  key!: string;

  @IsName('project')
  name!: string;
}

export class UpdateProjectDto {
  @ImmutableKey('project')
  key?: string;

  @IsName('project', { optional: true })
  name?: string;
}

export class ProjectDto {
  @ApiProperty({ example: 'birdwatch' })
  key!: string;

  @ApiProperty({ example: 'Birdwatch' })
  name!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
