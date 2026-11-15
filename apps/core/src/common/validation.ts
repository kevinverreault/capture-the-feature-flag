import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/** The messages of a 400, grouped by the property of the request body they are about. */
export type FieldMessages = Record<string, string[]>;

/**
 * A 400 for an invalid request body. `message` lists every message, as Nest's own validation errors do; `fields`
 * groups them by property (nested properties as dotted paths), so clients can place each next to its input.
 */
export function invalidBody(fields: FieldMessages): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: Object.values(fields).flat(),
    fields,
  });
}

/** The ValidationPipe's exceptionFactory: class-validator's errors as {@link invalidBody}. */
export function validationFailed(errors: ValidationError[]): BadRequestException {
  const fields: FieldMessages = {};
  const collect = (error: ValidationError, path: string): void => {
    const messages = Object.values(error.constraints ?? {});
    if (messages.length > 0) (fields[path] ??= []).push(...messages);
    for (const child of error.children ?? []) collect(child, `${path}.${child.property}`);
  };
  for (const error of errors) collect(error, error.property);
  return invalidBody(fields);
}
