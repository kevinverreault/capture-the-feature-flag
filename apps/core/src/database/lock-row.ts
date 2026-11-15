import { type Environment, type Flag, Prisma, type Project, type Targeting } from '../generated/prisma/client.js';

/** The rows that can be locked, by the name a caller uses for them. */
interface Rows {
  project: Project;
  environment: Environment;
  flag: Flag;
  targeting: Targeting;
}

const tables: Record<keyof Rows, string> = {
  project: 'projects',
  environment: 'environments',
  flag: 'flags',
  targeting: 'targeting',
};

const reloaders: { [T in keyof Rows]: (tx: Prisma.TransactionClient, id: string) => Promise<Rows[T]> } = {
  project: (tx, id) => tx.project.findUniqueOrThrow({ where: { id } }),
  environment: (tx, id) => tx.environment.findUniqueOrThrow({ where: { id } }),
  flag: (tx, id) => tx.flag.findUniqueOrThrow({ where: { id } }),
  targeting: (tx, id) => tx.targeting.findUniqueOrThrow({ where: { id } }),
};

/**
 * Locks a row until the transaction ends, and says whether it still exists.
 *
 * Creating a flag and creating or deleting an environment all lock their project's row, so none of them can
 * leave a flag without targeting in an environment, or write targeting for an environment that is going away.
 */
export async function lockRow(tx: Prisma.TransactionClient, table: keyof Rows, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<
    unknown[]
  >`SELECT id FROM ${Prisma.raw(`"${tables[table]}"`)} WHERE id = ${id}::uuid FOR UPDATE`;
  return rows.length > 0;
}

/**
 * Locks a row (see {@link lockRow}) and reloads it under the lock, or throws `notFound()` when it was deleted
 * meanwhile. A change takes it before reading the row it changes, so the state its audit entry records as "before"
 * is the state it actually changed.
 */
export async function lockAndReload<T extends keyof Rows>(
  tx: Prisma.TransactionClient,
  table: T,
  id: string,
  notFound: () => Error,
): Promise<Rows[T]> {
  if (!(await lockRow(tx, table, id))) throw notFound();
  return reloaders[table](tx, id);
}
