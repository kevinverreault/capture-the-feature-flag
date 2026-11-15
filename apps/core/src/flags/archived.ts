import { ConflictException } from '@nestjs/common';
import type { Flag, Prisma } from '../generated/prisma/client.js';

/**
 * What makes a flag an archived flag, in one place: a flag is archived while `archivedAt` is set. An archived flag
 * is hidden from the flag list, left out of snapshots, and kept as it was archived until it is restored.
 */

/** A `where` fragment matching the flags that are not archived. */
export const notArchived = { archivedAt: null } satisfies Prisma.FlagWhereInput;

/** A `where` fragment matching archived flags. */
export const archived = { archivedAt: { not: null } } satisfies Prisma.FlagWhereInput;

export function isArchived(flag: Pick<Flag, 'archivedAt'>): boolean {
  return flag.archivedAt !== null;
}

/** Rejects a change to an archived flag with 409: it stays as it was archived until restored. */
export function assertNotArchived(flag: Flag): void {
  if (isArchived(flag)) {
    throw new ConflictException(`Flag ${flag.key} is archived; restore it before changing it`);
  }
}
