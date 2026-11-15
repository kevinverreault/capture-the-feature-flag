import { fileURLToPath } from 'node:url';
import { createProjectGraphAsync } from '@nx/devkit';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The boundaries that keep the admin app (ADR 0003) and everything else off Core's internals and the database:
 * linting a file that imports Core or Prisma from outside Core fails. Each probe is linted as if it were a file of
 * that project; nothing is written to disk.
 */

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = new ESLint({ cwd: workspaceRoot });

async function boundaryErrors(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${workspaceRoot}${file}` });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === '@nx/enforce-module-boundaries')
    .map((message) => message.message);
}

describe('module boundaries', () => {
  // The rule reads the project graph Nx caches, which `nx run … lint` computes first.
  beforeAll(() => createProjectGraphAsync({ exitOnError: true }));

  it.each([
    ['the admin app', 'apps/admin/src/lib/probe.ts'],
    ['the admin app (an Astro page)', 'apps/admin/src/pages/probe.astro'],
    ['a library', 'libs/core-api-client/src/probe.ts'],
  ])('keep %s from importing Core', async (_what, file) => {
    const code = file.endsWith('.astro')
      ? "---\nimport { loadConfig } from '@ctff/core';\n---\n<p>{String(loadConfig)}</p>\n"
      : "import { loadConfig } from '@ctff/core';\nexport const probe = loadConfig;\n";
    expect(await boundaryErrors(file, code)).toHaveLength(1);
  });

  it.each([
    ['the admin app', 'apps/admin/src/lib/probe.ts'],
    ['a library', 'libs/core-api-client/src/probe.ts'],
  ])('keep %s from importing Prisma', async (_what, file) => {
    const code = "import { PrismaClient } from '@prisma/client';\nexport const probe = PrismaClient;\n";
    expect(await boundaryErrors(file, code)).toEqual([expect.stringContaining('@prisma/client')]);
  });

  it('let Core use Prisma', async () => {
    const code = "import { PrismaPg } from '@prisma/adapter-pg';\nexport const probe = PrismaPg;\n";
    expect(await boundaryErrors('apps/core/src/probe.ts', code)).toEqual([]);
  });
});
