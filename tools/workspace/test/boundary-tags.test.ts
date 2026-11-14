import { createProjectGraphAsync } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

/**
 * The module-boundary rules in eslint.config.mjs (libraries may not depend on apps, admin may not
 * depend on core, only core may use Prisma) are keyed on tags, so a project without them escapes the rules.
 */
const typeTag = /^type:(app|lib|tool)$/;
const scopeTag = /^scope:(core|admin|evaluator|birdwatch|showcase|shared)$/;

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
      expect(tags.filter((tag) => typeTag.test(tag))).toHaveLength(1);
      expect(tags.filter((tag) => scopeTag.test(tag))).toHaveLength(1);
    },
  );
});
