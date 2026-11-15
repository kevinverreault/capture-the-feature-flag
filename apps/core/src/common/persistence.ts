import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

/** Runs a write that may hit a unique constraint (a key already in use), turning that into 409. */
export async function withUniqueKey<T>(write: () => Promise<T>, conflictMessage: string): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(conflictMessage);
    }
    throw error;
  }
}

/**
 * Runs an update guarded by the version it is based on (an `updateMany` filtered on `version`, which also
 * increments it). When nothing matched, the row changed since that version, and the update is rejected with 409.
 */
export async function updateAtVersion(
  update: () => Promise<{ count: number }>,
  what: string,
  version: number,
): Promise<void> {
  const { count } = await update();
  if (count === 0) {
    throw new ConflictException(`${what} has changed since version ${version}; reload it and try again`);
  }
}
