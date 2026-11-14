import nx from '@nx/eslint-plugin';
import globals from 'globals';

/**
 * Module boundaries. Every Nx project carries exactly one `type:*` tag and one
 * `scope:*` tag (checked by the `workspace` project's tests):
 *
 * - type:app | type:lib | type:tool
 * - scope:core | scope:admin | scope:evaluator | scope:birdwatch | scope:showcase | scope:shared
 */
const prismaImports = ['prisma', '@prisma/*', '.prisma/*'];

export const depConstraints = [
  // Libraries may not depend on apps (or tools).
  { sourceTag: 'type:lib', onlyDependOnLibsWithTags: ['type:lib'] },
  { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:lib', 'type:app'] },
  { sourceTag: 'type:tool', onlyDependOnLibsWithTags: ['type:lib', 'type:tool'] },
  // The admin app talks to Core only over HTTP, through core-api-client (ADR 0003).
  { sourceTag: 'scope:admin', notDependOnLibsWithTags: ['scope:core'] },
  // Only Core owns the database, so only Core may use Prisma.
  { sourceTag: '/^scope:(?!core$)/', bannedExternalImports: prismaImports },
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/.astro', '**/node_modules', '**/coverage', 'vendor/**', '.nx/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts', '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints,
        },
      ],
    },
  },
];
