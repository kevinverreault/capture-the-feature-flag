import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Locks a project's row until the transaction ends. Creating a flag and creating an environment both take it, so
 * the two can't run concurrently and leave a flag without targeting in an environment. Fails with 404 if the
 * project was deleted since it was looked up.
 */
export async function lockProject(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const rows = await tx.$queryRaw<unknown[]>`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundException('Project not found');
}
