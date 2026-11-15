import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** A connection URL with the right to create databases; each test file creates its own. */
    adminDatabaseUrl: string;
  }
}

/**
 * Starts PostgreSQL 17 with Testcontainers, unless CTFF_TEST_DATABASE_URL points at an existing server (for
 * machines without Docker).
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const externalUrl = process.env['CTFF_TEST_DATABASE_URL'];
  if (externalUrl) {
    project.provide('adminDatabaseUrl', externalUrl);
    return async () => undefined;
  }

  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:17-alpine').start();
  project.provide('adminDatabaseUrl', container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
