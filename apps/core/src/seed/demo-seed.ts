import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import type { Logger } from 'pino';
import { EnvironmentsService } from '../environments/environments.service.js';
import { FlagsService } from '../flags/flags.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { TargetingService } from '../targeting/targeting.service.js';

/** Who the demo seed's changes are attributed to in the audit log. */
export const seedActor = 'seed';

/** Held while one Core checks and seeds, so replicas starting together on an empty database seed it once. */
const seedLockId = 72707370;

interface SeedFlag {
  key: string;
  name: string;
  description: string;
  tags: string[];
  /** Whether targeting is switched on in every environment. Flags not switched on keep their off-state targeting. */
  on?: boolean;
}

/**
 * The Birdwatch demo (apps/birdwatch-api and apps/birdwatch-web): its project, environments and flags.
 * `new-sighting-form` is a kill switch, so it starts on, serving its default variation `true`.
 */
export const birdwatchSeed = {
  project: { key: 'birdwatch', name: 'Birdwatch' },
  environments: [
    { key: 'development', name: 'Development' },
    { key: 'production', name: 'Production' },
  ],
  flags: [
    {
      key: 'new-sighting-form',
      name: 'New sighting form',
      description: 'Kill switch for the "Log a sighting" form in Birdwatch and the endpoint behind it.',
      tags: ['birdwatch', 'kill-switch'],
      on: true,
    },
    {
      key: 'rare-bird-alerts',
      name: 'Rare bird alerts',
      description: 'Shows the rare-bird alert banner in Birdwatch, targeted by country.',
      tags: ['birdwatch'],
    },
    {
      key: 'photo-id-beta',
      name: 'Photo ID (beta)',
      description: 'Shows the "Photo ID (beta)" button in Birdwatch, targeted at individual birders.',
      tags: ['birdwatch', 'beta'],
    },
  ] satisfies SeedFlag[],
};

/**
 * Seeds the Birdwatch demo on first start: when the database has no project at all. Otherwise it does nothing, so
 * restarting Core, or an operator who deleted the demo and has projects of their own, never gets it back. It goes
 * through the same services as the API, so the seed has its audit entries and off-state targeting like any change.
 * A seed that fails halfway removes the project it created and fails Core's start.
 */
export async function seedDemo(app: INestApplication, databaseUrl: string, logger: Logger): Promise<void> {
  const lock = new pg.Client({ connectionString: databaseUrl });
  await lock.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [seedLockId]);
    const projects = app.get(ProjectsService);
    if ((await projects.list()).length > 0) {
      logger.info('The database has projects: skipping the demo seed');
      return;
    }
    const { project } = birdwatchSeed;
    await projects.create(project, seedActor);
    try {
      await seedProject(app);
    } catch (error) {
      // Removing the half-seeded project lets the next start seed it again; failing that, the seed error matters.
      await projects
        .delete(project.key, seedActor)
        .catch((cleanup: unknown) => logger.error({ err: cleanup }, 'Could not remove the half-seeded demo project'));
      throw new Error(`The demo seed failed: ${(error as Error).message}`, { cause: error });
    }
    logger.info({ project: project.key }, 'Seeded the demo project');
  } finally {
    await lock.end();
  }
}

async function seedProject(app: INestApplication): Promise<void> {
  const { project, environments, flags } = birdwatchSeed;
  const environmentsService = app.get(EnvironmentsService);
  const flagsService = app.get(FlagsService);
  const targetingService = app.get(TargetingService);
  for (const environment of environments) await environmentsService.create(project.key, environment, seedActor);
  for (const { on, ...flag } of flags as SeedFlag[]) {
    await flagsService.create(project.key, flag, seedActor);
    if (!on) continue;
    for (const environment of environments) {
      const { version } = await targetingService.get(project.key, flag.key, environment.key);
      await targetingService.update(project.key, flag.key, environment.key, { version, on }, seedActor);
    }
  }
}
