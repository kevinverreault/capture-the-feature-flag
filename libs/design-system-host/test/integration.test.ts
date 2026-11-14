import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'astro';
import { afterEach, describe, expect, it } from 'vitest';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}/`, import.meta.url));

describe('design system host integration', () => {
  let outDir: string | undefined;

  afterEach(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
    outDir = undefined;
  });

  async function buildFixture(name: string): Promise<string> {
    outDir = await mkdtemp(join(tmpdir(), `ctff-ds-${name}-`));
    await build({ root: fixture(name), outDir, logLevel: 'silent' });
    return readFile(join(outDir, 'index.html'), 'utf8');
  }

  it('builds a host page that renders design system components from the submodule', async () => {
    const html = await buildFixture('host');

    expect(html).toMatch(/<button[^>]*>\s*Capture\s*<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/sightings"[^>]*>\s*Sightings\s*<\/a>/);
    expect(html).toContain('Rare bird spotted');
    // Alert's info icon comes from the host's own src/svg folder.
    expect(html).toMatch(/<svg[^>]*class="alert-icon"/);
  });

  it('fails the build with a clear message when the host has no src/svg folder', async () => {
    await expect(buildFixture('no-svg')).rejects.toThrow(/src\/svg/);
  });
});
