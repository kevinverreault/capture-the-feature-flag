import nx from '@nx/eslint-plugin';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

/**
 * Module boundaries. Every Nx project carries exactly one `type:*` tag and one `scope:*` tag; the allowed
 * values are checked by tools/workspace/test/boundary-tags.test.ts.
 */
const prismaImports = ['prisma', '@prisma/*', '.prisma/*'];

const depConstraints = [
  // Libraries may not depend on apps (or tools).
  { sourceTag: 'type:lib', onlyDependOnLibsWithTags: ['type:lib'] },
  { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:lib', 'type:app'] },
  { sourceTag: 'type:tool', onlyDependOnLibsWithTags: ['type:lib', 'type:tool'] },
  // Only Core owns the database, so only Core may use Prisma. Nothing else may depend on Core either, which
  // also keeps Prisma from leaking through it: the admin app (ADR 0003), Evaluators (ADR 0001) and the rest
  // talk to Core over HTTP.
  {
    sourceTag: '/^scope:(?!core$)/',
    notDependOnLibsWithTags: ['scope:core'],
    bannedExternalImports: prismaImports,
  },
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  ...astro.configs.recommended,
  {
    ignores: ['**/dist', '**/.astro', '**/node_modules', '**/coverage', 'vendor/**', '.nx/**'],
  },
  {
    files: ['**/*.{ts,tsx,cts,mts,js,jsx,cjs,mjs,astro}'],
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
