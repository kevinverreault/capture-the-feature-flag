import { createProjectGraphAsync } from '@nx/devkit';
import { describe, expect, it } from 'vitest';
import { scopeTags, typeTags } from '../src/module-boundaries.mjs';

/**
 * The module-boundary rules (libraries may not depend on apps, nothing but core may depend on core or use
 * Prisma) are keyed on tags, so a project without them escapes the rules.
 */

describe('module-boundary tags', async () => {
  const graph = await createProjectGraphAsync({ exitOnError: true });
  const projects = Object.values(graph.nodes);

  it('finds the workspace projects', () => {
    expect(projects.map((project) => project.name)).toEqual(
      expect.arrayContaining(['@ctff/workspace', '@ctff/design-system-host']),
    );
  });

  it.each(projects.map((project) => [project.name, project.data.tags ?? []] as const))(
    '%s has exactly one type tag and one scope tag',
    (_name, tags) => {
      expect(tags.filter((tag) => typeTags.includes(tag))).toHaveLength(1);
      expect(tags.filter((tag) => scopeTags.includes(tag))).toHaveLength(1);
    },
  );
});
