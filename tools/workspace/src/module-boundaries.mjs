/**
 * The workspace's module boundaries, in one place. Every Nx project carries exactly one `type:*` tag and one
 * `scope:*` tag from these lists (checked by test/boundary-tags.test.ts), and the root eslint.config.mjs
 * enforces `depConstraints` through `@nx/enforce-module-boundaries`.
 */

export const typeTags = ['type:app', 'type:lib', 'type:tool'];

export const scopeTags = [
  'scope:core',
  'scope:admin',
  'scope:evaluator',
  'scope:birdwatch',
  'scope:showcase',
  'scope:terraform',
  'scope:e2e',
  'scope:shared',
];

const prismaImports = ['prisma', 'prisma/*', '@prisma/*', '.prisma/*'];

export const depConstraints = [
  // Libraries may not depend on apps (or tools).
  { sourceTag: 'type:lib', onlyDependOnLibsWithTags: ['type:lib'] },
  { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:lib', 'type:app'] },
  { sourceTag: 'type:tool', onlyDependOnLibsWithTags: ['type:lib', 'type:tool'] },
  // Only Core owns the database, so only Core may use Prisma. Nothing else may depend on Core either, which
  // also keeps Prisma from leaking through it: the admin app (ADR 0003), Evaluators (ADR 0001) and the rest
  // talk to Core over HTTP.
  //
  // One recorded exception: the Terraform provider (Go, so outside these lint rules) declares an Nx
  // implicitDependency on Core. It imports nothing from Core and calls it only over HTTP; the edge exists so its
  // acceptance tests run against Core's build, and re-run in `nx affected` when Core changes.
  {
    sourceTag: '/^scope:(?!core$)/',
    notDependOnLibsWithTags: ['scope:core'],
    bannedExternalImports: prismaImports,
  },
];
