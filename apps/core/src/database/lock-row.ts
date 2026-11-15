import { Prisma } from '../generated/prisma/client.js';

const tables = { project: 'projects', environment: 'environments', flag: 'flags', targeting: 'targeting' } as const;

/**
 * Locks a row until the transaction ends, and says whether it still exists. A change takes it before reading the
 * row it changes, so the state its audit entry records as "before" is the state it actually changed.
 */
export async function lockRow(tx: Prisma.TransactionClient, table: keyof typeof tables, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<
    unknown[]
  >`SELECT id FROM ${Prisma.raw(`"${tables[table]}"`)} WHERE id = ${id}::uuid FOR UPDATE`;
  return rows.length > 0;
}
