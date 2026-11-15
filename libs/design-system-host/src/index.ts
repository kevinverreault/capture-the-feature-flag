import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

/** Absolute path of the design system submodule's `src/` folder. */
const designSystemSrc = fileURLToPath(new URL('../../../vendor/design-system/src/', import.meta.url));

/** Icons the design system's own components render (Alert, Toast, Dialog, Pagination, ThemeToggle...). */
const designSystemIcons = [
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
            },
          },
        });
      },
    },
  };
}
