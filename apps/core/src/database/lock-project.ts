import type { Prisma } from '../generated/prisma/client.js';

/**
 * Locks a project's row until the transaction ends, and says whether the project still exists. Creating a flag
 * and creating or deleting an environment all take it, so none of them can leave a flag without targeting in an
 * environment, or write targeting for an environment that is going away.
 */
export async function lockProject(tx: Prisma.TransactionClient, projectId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<unknown[]>`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
  return rows.length > 0;
}
