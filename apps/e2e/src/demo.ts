import { createCoreApiClient, unwrap, type components } from '@ctff/core-api-client';
import { urls } from './stack.js';

type TargetingChange = components['schemas']['UpdateTargetingDto'];

/** Core's API, with the suite's own changes attributed to `e2e` in the audit log. */
export const core = createCoreApiClient({ baseUrl: urls.core, actor: 'e2e' });

/** The project and environment Birdwatch evaluates its flags in (compose.yaml's birdwatch services). */
export const projectKey = 'birdwatch';
export const environmentKey = 'development';

/** Variation indexes of a boolean flag, stored as `[true, false]` (ADR 0002). */
export const trueVariation = 0;
export const falseVariation = 1;

/** Flags the suite creates are named so, and deleted when the demo is put back. */
export const createdFlagPrefix = 'e2e-';

/** The birders of Birdwatch's mock data that the scenarios log in as, with their country. */
export const birders = {
  alice: { name: 'Alice', country: 'CA' },
  bram: { name: 'Bram', country: 'NL' },
  chiara: { name: 'Chiara', country: 'IT' },
  dev: { name: 'Dev', country: 'CA' },
} as const;
export type BirderId = keyof typeof birders;

/**
 * The targeting Core's demo seed gives Birdwatch's flags (apps/core/src/seed/demo-seed.ts), which the scenarios
 * start from: `new-sighting-form` is a kill switch serving `true`, `rare-bird-alerts` serves `true` in CA, and
 * `photo-id-beta` serves `true` to Chiara.
 */
export const seededTargeting = {
  'new-sighting-form': {
    on: true,
    offVariation: falseVariation,
    defaultVariation: trueVariation,
    individualTargets: [],
    rules: [],
  },
  'rare-bird-alerts': {
    on: true,
    offVariation: falseVariation,
    defaultVariation: falseVariation,
    individualTargets: [],
    rules: [{ attribute: 'country', operator: 'in', values: ['CA'], variation: trueVariation }],
  },
  'photo-id-beta': {
    on: true,
    offVariation: falseVariation,
    defaultVariation: falseVariation,
    individualTargets: [{ variation: trueVariation, userIds: ['chiara'] }],
    rules: [],
  },
} satisfies Record<string, Omit<TargetingChange, 'version'>>;
export type DemoFlagKey = keyof typeof seededTargeting;

const flagPath = (flagKey: string) => ({ path: { projectKey, flagKey } });

/** JSON with object keys sorted, to compare what Core answers with what was asked whatever their key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)))
      : nested,
  );
}

/** Changes a flag's targeting in Birdwatch's environment, unless it already is as asked. */
export async function setTargeting(flagKey: string, change: Omit<TargetingChange, 'version'>): Promise<void> {
  const params = { path: { projectKey, flagKey, environmentKey } };
  const current = await unwrap(
    core.GET('/api/v1/projects/{projectKey}/flags/{flagKey}/targeting/{environmentKey}', { params }),
  );
  const unchanged = Object.entries(change).every(
    ([field, value]) => canonical(current[field as keyof typeof current]) === canonical(value),
  );
  if (unchanged) return;
  await unwrap(
    core.PATCH('/api/v1/projects/{projectKey}/flags/{flagKey}/targeting/{environmentKey}', {
      params,
      body: { version: current.version, ...change },
    }),
  );
}

/**
 * Puts the Birdwatch demo back as Core seeds it, in Birdwatch's environment: restores its flags if archived, gives
 * them their seeded targeting, and deletes the flags the suite created. Scenarios change the demo and call this
 * before and after, so they start from the same place whether the stack is fresh or not.
 */
export async function resetDemo(): Promise<void> {
  const flags = await unwrap(
    core.GET('/api/v1/projects/{projectKey}/flags', {
      params: { path: { projectKey }, query: { includeArchived: true } },
    }),
  ).catch((error: unknown) => {
    throw new Error(`Core has no Birdwatch demo project (start on an empty database with SEED_DEMO=true)`, {
      cause: error,
    });
  });

  for (const flag of flags) {
    if (flag.key.startsWith(createdFlagPrefix)) {
      if (!flag.archived)
        await unwrap(
          core.POST('/api/v1/projects/{projectKey}/flags/{flagKey}/archive', { params: flagPath(flag.key) }),
        );
      await unwrap(core.DELETE('/api/v1/projects/{projectKey}/flags/{flagKey}', { params: flagPath(flag.key) }));
    }
  }
  for (const [flagKey, targeting] of Object.entries(seededTargeting)) {
    const flag = flags.find((listed) => listed.key === flagKey);
    if (!flag) throw new Error(`Core's Birdwatch demo has no flag ${flagKey}`);
    if (flag.archived)
      await unwrap(core.POST('/api/v1/projects/{projectKey}/flags/{flagKey}/restore', { params: flagPath(flagKey) }));
    await setTargeting(flagKey, targeting);
  }
}
