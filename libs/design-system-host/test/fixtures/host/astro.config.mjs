import { defineConfig } from 'astro/config';
import designSystem from '../../../src/index.ts';

export default defineConfig({
  integrations: [designSystem()],
});
