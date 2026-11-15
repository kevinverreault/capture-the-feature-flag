import type { Context } from '@ctff/evaluation';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { IsOmittable } from './keys.js';

/**
 * A context (the shared `Context` type from @ctff/evaluation), with its validation and OpenAPI description: what
 * Evaluators report as seen and what the Contexts explorer evaluates.
 */
export class ContextDto implements Context {
  @ApiProperty({ required: false, description: 'Any non-empty string.', example: 'alice' })
  @IsOmittable()
  @IsString()
  @IsNotEmpty()
  user_id?: string;

  @ApiProperty({ required: false, description: 'An ISO 3166-1 alpha-2 code, in any case.', example: 'CA' })
  @IsOmittable()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'country must be an ISO 3166-1 alpha-2 code' })
  country?: string;
}
