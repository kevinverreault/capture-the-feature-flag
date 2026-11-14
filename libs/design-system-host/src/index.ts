import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

/** Absolute path of the design system submodule's `src/` folder. */
const designSystemSrc = fileURLToPath(new URL('../../../vendor/design-system/src/', import.meta.url));

/**
 * The host-side packages that design system components import. They are compiled from source by the
 * host, so these must resolve from the host app, not from the submodule (which has no node_modules).
 */
const hostDependencies = ['cva', 'node-html-parser'];

/** Icons the design system's own components render (Alert, Toast, Dialog, Pagination, ThemeToggle...). */
export const designSystemIcons = [
  'info',
  'circle-check',
  'triangle-alert',
  'circle-alert',
  'x',
  'chrevron-left',
  'chrevron-right',
  'sun',
  'moon-stars',
];

/**
 * Lets an Astro app import design system components from the `vendor/design-system` submodule:
 *
 * - `@ds/*` resolves to the submodule's `src/*`, e.g. `import Button from '@ds/components/ui/Button.astro'`.
 * - `@styles/*`, which the design system uses internally, resolves to its styles.
 * - `cva` and `node-html-parser` resolve from the host app.
 * - The host must provide the `src/svg/` folder that `Icon` loads SVGs from.
 */
export default function designSystem(): AstroIntegration {
  return {
    name: '@ctff/design-system-host',
    hooks: {
      'astro:config:setup': ({ config, updateConfig, logger }) => {
        const root = fileURLToPath(config.root);

        if (!existsSync(designSystemSrc)) {
          throw new Error(
            `The design system submodule is missing at ${designSystemSrc}. Run \`git submodule update --init\`.`,
          );
        }

        assertCvaAlias(root);

        const svgDir = fileURLToPath(new URL('./src/svg/', config.root));
        if (!existsSync(svgDir)) {
          throw new Error(
            `${root} has no src/svg folder. The design system's Icon loads SVGs from the host's src/svg; ` +
              `copy the icons you use from vendor/design-system/src/svg.`,
          );
        }
        const missing = designSystemIcons.filter((icon) => !existsSync(`${svgDir}${icon}.svg`));
        if (missing.length > 0) {
          logger.warn(
            `src/svg is missing icons that design system components render: ${missing.join(', ')}. ` +
              `Copy them from vendor/design-system/src/svg if you use those components.`,
          );
        }

        updateConfig({
          vite: {
            resolve: {
              alias: [
                { find: /^@ds\//, replacement: designSystemSrc },
                { find: /^@styles\//, replacement: `${designSystemSrc}styles/` },
              ],
              dedupe: hostDependencies,
            },
          },
        });
      },
    },
  };
}

/** Components import `cva` but use class-variance-authority's API; the npm package named `cva` is incompatible. */
function assertCvaAlias(root: string): void {
  const manifest = findPackageManifest(root, 'cva');
  if (!manifest) {
    throw new Error(
      `Install the design system's host dependencies in ${root}: pnpm add cva@npm:class-variance-authority node-html-parser`,
    );
  }
  const { name } = JSON.parse(readFileSync(manifest, 'utf8')) as { name: string };
  if (name !== 'class-variance-authority') {
    throw new Error(
      `'cva' resolves to the '${name}' package. Install it as an alias: pnpm add cva@npm:class-variance-authority`,
    );
  }
}

/** Finds `node_modules/<name>/package.json` the way Node resolves packages: from `dir` upwards. */
function findPackageManifest(dir: string, name: string): string | undefined {
  for (let current = resolve(dir); ; current = dirname(current)) {
    const manifest = join(current, 'node_modules', name, 'package.json');
    if (existsSync(manifest)) return manifest;
    if (dirname(current) === current) return undefined;
  }
}
