import type { Prisma } from '../generated/prisma/client.js';

/**
 * Takes the lock that serializes writes to an environment's seen contexts until the transaction ends. Ingestion
 * and retention both take it before they upsert or trim, in the order of the environment ids, so several Core
 * replicas writing the same environment wait for each other instead of deadlocking.
 */
export async function lockSeenContexts(tx: Prisma.TransactionClient, environmentIds: readonly string[]): Promise<void> {
  for (const environmentId of [...environmentIds].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`seen_contexts:${environmentId}`}, 0))`;
  }
}

/**
 * Keeps only the `cap` most recently seen contexts of the environment, deleting the rest. Ties in last-seen are
 * broken by id, the same order the seen-context list uses. Take {@link lockSeenContexts} first.
 */
export async function trimSeenContexts(
  tx: Prisma.TransactionClient,
  cap: number,
  environmentId: string,
): Promise<number> {
  return tx.$executeRaw`
    DELETE FROM seen_contexts WHERE id IN (
      SELECT id FROM seen_contexts
      WHERE environment_id = ${environmentId}::uuid
      ORDER BY last_seen DESC, id ASC
      OFFSET ${cap}
    )`;
}
