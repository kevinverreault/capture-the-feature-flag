import nx from '@nx/eslint-plugin';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import { depConstraints } from './tools/workspace/src/module-boundaries.mjs';

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
          depConstraints,
        },
      ],
    },
  },
];
