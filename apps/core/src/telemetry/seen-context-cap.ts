import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../database/prisma.service.js';

/**
 * Keeps only the `cap` most recently seen contexts of each environment (all of them, or those given), deleting
 * the rest. Ties in last-seen are broken by id, the same order the seen-context list uses.
 */
export async function trimSeenContexts(
  prisma: PrismaService,
  cap: number,
  environmentIds?: readonly string[],
): Promise<number> {
  const only =
    environmentIds === undefined
      ? Prisma.empty
      : Prisma.sql`WHERE environment_id = ANY(${[...environmentIds]}::uuid[])`;
  return prisma.$executeRaw`
    DELETE FROM seen_contexts WHERE id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY environment_id ORDER BY last_seen DESC, id ASC) AS rank
        FROM seen_contexts ${only}
      ) ranked
      WHERE rank > ${cap}
    )`;
}
