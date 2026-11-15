import designSystem from '@ctff/design-system-host';
import { defineConfig } from 'astro/config';

// A static site: `astro build` writes plain HTML and assets to dist/, which the image serves with nginx.
export default defineConfig({
  output: 'static',
  integrations: [designSystem()],
});
