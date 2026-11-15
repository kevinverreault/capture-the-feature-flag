import type { Prisma } from '../generated/prisma/client.js';

/**
 * Locks a project's row until the transaction ends. Creating a flag and creating an environment both take it, so
 * the two can't run concurrently and leave a flag without targeting in an environment.
 */
export async function lockProject(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
}
