import { applyDecorators, BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

/** Lowercase kebab-case: lowercase letters and digits in groups joined by single hyphens, starting with a letter. */
export const keyPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const keyMaxLength = 64;

/** A project, environment or flag key on create: lowercase kebab-case, immutable afterwards. */
export function IsKey(what: string): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      description: `The ${what} key: lowercase kebab-case, immutable after creation.`,
      pattern: keyPattern.source,
      maxLength: keyMaxLength,
      example: 'rare-bird-alerts',
    }),
    IsString(),
    MaxLength(keyMaxLength),
    Matches(keyPattern, { message: `${what} key must be lowercase kebab-case (e.g. rare-bird-alerts)` }),
  );
}

/**
 * An immutable key in an update body. Clients that send the whole resource back may repeat it; the service
 * rejects any other value with {@link assertKeyUnchanged}.
 */
export function ImmutableKey(what: string): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ required: false, description: `The current ${what} key, if sent. It cannot be changed.` }),
    IsOmittable(),
    IsString(),
  );
}

/** Fails with 400 when an update body tries to change an immutable key. */
export function assertKeyUnchanged(what: string, current: string, sent: string | undefined): void {
  if (sent !== undefined && sent !== current) {
    throw new BadRequestException([`${what} key is immutable and cannot be changed`]);
  }
}

/** A display name: a non-blank string. Optional in update bodies. */
export function IsName(what: string, { optional = false } = {}): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ description: `The ${what}'s display name.`, maxLength: 200, required: !optional }),
    ...(optional ? [IsOmittable()] : []),
    IsString(),
    MaxLength(200),
    Matches(/\S/, { message: 'name must not be blank' }),
    IsNotEmpty(),
  );
}

/**
 * Lets an update body leave a property out, but not set it to `null` (class-validator's IsOptional accepts both,
 * and none of these columns is nullable).
 */
export function IsOmittable(): PropertyDecorator {
  return ValidateIf((_object, value) => value !== undefined);
}
