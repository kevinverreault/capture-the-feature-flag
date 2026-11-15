import { Prisma } from '../generated/prisma/client.js';

/** True when a write failed on a unique constraint (e.g. a key already used in the project). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
