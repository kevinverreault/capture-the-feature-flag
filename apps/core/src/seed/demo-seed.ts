import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import type { Logger } from 'pino';
import { PrismaService } from '../database/prisma.service.js';
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

/** The name the completed demo seed is recorded under. */
const seedName = 'birdwatch-demo';

/**
 * Seeds the Birdwatch demo once per database: on every start until it has completed, after which it is recorded
 * and never runs again, so an operator who deletes the demo doesn't get it back. Each step skips what is already
 * there, so a seed interrupted halfway (Core killed during it) is finished on the next start, and a database that
 * already holds projects of its own gets the demo next to them. It goes through the same services as the API, so
 * the seed has its audit entries and off-state targeting like any change.
 */
export async function seedDemo(app: INestApplication, databaseUrl: string, logger: Logger): Promise<void> {
  const lock = new pg.Client({ connectionString: databaseUrl });
  await lock.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [seedLockId]);
    const prisma = app.get(PrismaService);
    if (await prisma.completedSeed.findUnique({ where: { name: seedName } })) {
      logger.debug('The demo seed has already completed');
      return;
    }
    await seedProject(app);
    await prisma.completedSeed.create({ data: { name: seedName } });
    logger.info({ project: birdwatchSeed.project.key }, 'Seeded the demo project');
  } finally {
    await lock.end();
  }
}

async function seedProject(app: INestApplication): Promise<void> {
  const { project, environments, flags } = birdwatchSeed;
  const projectsService = app.get(ProjectsService);
  const environmentsService = app.get(EnvironmentsService);
  const flagsService = app.get(FlagsService);
  const targetingService = app.get(TargetingService);

  const existing = (await projectsService.list()).some((listed) => listed.key === project.key);
  if (!existing) await projectsService.create(project, seedActor);
  const environmentKeys = new Set((await environmentsService.list(project.key)).map((listed) => listed.key));
  for (const environment of environments) {
    if (!environmentKeys.has(environment.key)) await environmentsService.create(project.key, environment, seedActor);
  }
  const listedFlags = await flagsService.list(project.key, { includeArchived: true });
  for (const { on, ...flag } of flags as SeedFlag[]) {
    const listed = listedFlags.find((candidate) => candidate.key === flag.key);
    if (!listed) await flagsService.create(project.key, flag, seedActor);
    // An archived flag's targeting can't change: it stays as the admin left it.
    if (!on || listed?.archived) continue;
    for (const environment of environments) {
      const targeting = await targetingService.get(project.key, flag.key, environment.key);
      // Version 1 is targeting nobody has changed since the flag was created; anything else is left as it is.
      if (targeting.version !== 1 || targeting.on === on) continue;
      await targetingService.update(project.key, flag.key, environment.key, { version: 1, on }, seedActor);
    }
  }
}
