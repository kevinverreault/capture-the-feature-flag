import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Logger } from 'pino';

/** The migrations authored with `prisma migrate dev`, shipped next to dist/ in the image. */
export const migrationsDir = fileURLToPath(new URL('../../prisma/migrations', import.meta.url));

/** The advisory lock id Prisma Migrate takes, so Core and the Prisma CLI never migrate at the same time. */
const migrationLockId = 72707369;

/**
 * Applies pending migrations from prisma/migrations, so Core owns its schema without shipping the Prisma CLI and
 * its native schema engine in the image. Progress is recorded in Prisma's own `_prisma_migrations` table (same
 * checksums), so `prisma migrate status` and `prisma migrate dev` keep working against a database Core migrated.
 * Each migration runs in its own transaction, and concurrent Core replicas serialize on an advisory lock.
 */
export async function applyMigrations(databaseUrl: string, logger: Logger, dir = migrationsDir): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum"            VARCHAR(64) NOT NULL,
        "finished_at"         TIMESTAMPTZ,
        "migration_name"      VARCHAR(255) NOT NULL,
        "logs"                TEXT,
        "rolled_back_at"      TIMESTAMPTZ,
        "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )`);

    const { rows } = await client.query<{ migration_name: string; checksum: string; finished_at: Date | null }>(
      'SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL',
    );
    const failed = rows.find((row) => row.finished_at === null);
    if (failed) {
      throw new Error(
        `Migration ${failed.migration_name} failed earlier and must be resolved (prisma migrate resolve) first`,
      );
    }
    const applied = new Map(rows.map((row) => [row.migration_name, row.checksum]));

    const names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const name of names) {
      const sql = await readFile(join(dir, name, 'migration.sql'), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const appliedChecksum = applied.get(name);
      if (appliedChecksum !== undefined) {
        if (appliedChecksum !== checksum) logger.warn({ migration: name }, 'Applied migration was modified since');
        continue;
      }

      logger.info({ migration: name }, 'Applying migration');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
           VALUES ($1, $2, $3, now(), 1)`,
          [randomUUID(), checksum, name],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${name} failed: ${(error as Error).message}`, { cause: error });
      }
    }

    const unknown = [...applied.keys()].filter((name) => !names.includes(name));
    if (unknown.length > 0) logger.warn({ migrations: unknown }, 'Database has migrations this Core does not know');
  } finally {
    await client.end();
  }
}
