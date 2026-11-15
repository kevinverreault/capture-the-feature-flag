import { ConflictException } from '@nestjs/common';

/** The 409 for an update based on a version that is no longer current. */
export function staleVersion(what: string, version: number): ConflictException {
  return new ConflictException(`${what} has changed since version ${version}; reload it and try again`);
}
