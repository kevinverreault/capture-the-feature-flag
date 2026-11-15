import { minuteOf, normalizeContext, seenContextKey } from '@ctff/evaluation';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EnvironmentsService } from '../environments/environments.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { lockSeenContexts, trimSeenContexts } from './seen-context-cap.js';
import { dayMs } from './time.js';
import { invalidBody } from '../common/validation.js';
import {
  defaultSeenContextsListed,
  type EvaluationCountBucketDto,
  type EvaluationCountsQueryDto,
  maxCountRangeDays,
  type SeenContextsQueryDto,
  type StoredSeenContextDto,
  type TelemetryBatchDto,
} from './telemetry.dto.js';

interface CountRow {
  environmentId: string;
  flagId: string;
  variationIndex: number;
  minute: string;
  count: number;
}

interface SeenRow {
  environmentId: string;
  contextKey: string;
  userId: string | null;
  country: string | null;
  lastSeen: string;
}

/**
 * The text with the LIKE wildcards (`%`, `_`) and the escape character escaped, so Prisma's `contains` matches it
 * as itself: it builds a LIKE pattern without escaping them.
 */
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** How long ingesting one batch may wait for a database connection, then take; the Evaluator waits longer. */
const ingestMaxWaitMs = 10_000;
const ingestTimeoutMs = 30_000;

/**
 * Takes a key-share lock on each environment and flag that still exists, until the transaction ends, so none is
 * deleted under the batch, and returns the ids it locked. A row being deleted (or locked by a delete) right now is
 * skipped rather than waited for, so ingestion never deadlocks with a delete.
 */
async function lockExisting(
  tx: Prisma.TransactionClient,
  environmentIds: string[],
  flagIds: string[],
): Promise<Set<string>> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text FROM environments WHERE id = ANY(${environmentIds}::uuid[])
      ORDER BY id FOR KEY SHARE SKIP LOCKED`;
  const flags = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text FROM flags WHERE id = ANY(${flagIds}::uuid[]) ORDER BY id FOR KEY SHARE SKIP LOCKED`;
  return new Set([...rows, ...flags].map((row) => row.id));
}

/** Evaluation telemetry: ingesting what Evaluators send (ADR 0001), and reading it back. */
@Injectable()
export class TelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly environments: EnvironmentsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Adds the batch's counts to the stored count buckets, and records its seen contexts with the later of the
   * stored and sent last-seen, then keeps only the newest up to the seen-context cap in each environment. Telemetry
   * for an SDK key, flag or variation that no longer exists is skipped: it may have been deleted since.
   */
  async ingest(batch: TelemetryBatchDto): Promise<void> {
    const sdkKeys = [...new Set(batch.environments.map((entry) => entry.sdkKey))];
    const environments = await this.prisma.environment.findMany({
      where: { sdkKey: { in: sdkKeys } },
      select: {
        id: true,
        sdkKey: true,
        project: { select: { flags: { select: { id: true, key: true, variations: true } } } },
      },
    });
    const bySdkKey = new Map(environments.map((environment) => [environment.sdkKey, environment]));

    const counts = new Map<string, CountRow>();
    const seen = new Map<string, SeenRow>();
    const now = Date.now();
    for (const entry of batch.environments) {
      const environment = bySdkKey.get(entry.sdkKey);
      if (!environment) continue;
      const flags = new Map(environment.project.flags.map((flag) => [flag.key, flag]));

      for (const { flagKey, variationIndex, minute, count } of entry.counts) {
        const flag = flags.get(flagKey);
        if (!flag || variationIndex >= (flag.variations as unknown[]).length) continue;
        // A clock running ahead mustn't make buckets in the future.
        const start = minuteOf(Math.min(Date.parse(minute), now));
        const key = `${environment.id} ${flag.id} ${variationIndex} ${start}`;
        const row = counts.get(key);
        if (row) row.count += count;
        else counts.set(key, { environmentId: environment.id, flagId: flag.id, variationIndex, minute: start, count });
      }

      for (const { context, lastSeen } of entry.seenContexts) {
        const normalized = normalizeContext(context);
        const contextKey = normalized && seenContextKey(normalized);
        if (!normalized || !contextKey) continue;
        const userId = normalized.user_id ?? null;
        const country = normalized.country ?? null;
        // A clock running ahead mustn't keep a context at the top of the list.
        const seenAt = new Date(Math.min(Date.parse(lastSeen), now)).toISOString();
        const key = `${environment.id} ${contextKey}`;
        const row = seen.get(key);
        if (!row) seen.set(key, { environmentId: environment.id, contextKey, userId, country, lastSeen: seenAt });
        else if (row.lastSeen < seenAt) row.lastSeen = seenAt;
      }
    }

    // Sorted, so concurrent batches from several Evaluators lock rows in the same order and can't deadlock.
    const sorted = <T>(rows: Map<string, T>) =>
      [...rows.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, row]) => row);
    const { seenContextCap } = await this.settings.get();

    // One transaction, so a batch is stored whole or not at all. Batches for the same environment wait for each
    // other's lock, so they get longer than Prisma's default limits to get a connection and to finish.
    await this.prisma.$transaction(
      async (tx) => {
        // The environments and flags may have been deleted since they were looked up, or be being deleted now.
        // Holding them until the end keeps them from going away mid-batch; those already going away are skipped
        // with their telemetry, rather than failing the whole batch on a foreign key.
        const kept = await lockExisting(
          tx,
          [...new Set([...counts.values(), ...seen.values()].map((row) => row.environmentId))],
          [...new Set([...counts.values()].map((row) => row.flagId))],
        );
        const countRows = sorted(counts).filter((row) => kept.has(row.environmentId) && kept.has(row.flagId));
        const seenRows = sorted(seen).filter((row) => kept.has(row.environmentId));
        const environmentIds = [...new Set(seenRows.map((row) => row.environmentId))];

        if (countRows.length > 0) {
          await tx.$executeRaw`
          INSERT INTO evaluation_counts (environment_id, flag_id, variation_index, minute, count)
          SELECT * FROM unnest(
            ${countRows.map((row) => row.environmentId)}::uuid[],
            ${countRows.map((row) => row.flagId)}::uuid[],
            ${countRows.map((row) => row.variationIndex)}::int[],
            ${countRows.map((row) => row.minute)}::timestamptz[],
            ${countRows.map((row) => row.count)}::int[]
          )
          ON CONFLICT (environment_id, flag_id, variation_index, minute)
          DO UPDATE SET count = evaluation_counts.count + EXCLUDED.count`;
        }
        if (seenRows.length > 0) {
          await lockSeenContexts(tx, environmentIds);
          await tx.$executeRaw`
          INSERT INTO seen_contexts (id, environment_id, context_key, user_id, country, last_seen)
          SELECT gen_random_uuid(), * FROM unnest(
            ${seenRows.map((row) => row.environmentId)}::uuid[],
            ${seenRows.map((row) => row.contextKey)}::text[],
            ${seenRows.map((row) => row.userId)}::text[],
            ${seenRows.map((row) => row.country)}::text[],
            ${seenRows.map((row) => row.lastSeen)}::timestamptz[]
          )
          ON CONFLICT (environment_id, context_key)
          DO UPDATE SET last_seen = GREATEST(seen_contexts.last_seen, EXCLUDED.last_seen)`;
          for (const environmentId of environmentIds) await trimSeenContexts(tx, seenContextCap, environmentId);
        }
      },
      { maxWait: ingestMaxWaitMs, timeout: ingestTimeoutMs },
    );
  }

  /**
   * The count buckets of a project from `from` (default: 24 hours before `to`) until `to` (default: now), for at
   * most a week.
   */
  async counts(projectKey: string, query: EvaluationCountsQueryDto): Promise<EvaluationCountBucketDto[]> {
    const project = await this.projects.find(projectKey);
    const environment = query.environment ? await this.environments.find(project, query.environment) : undefined;
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - dayMs);
    if (to.getTime() - from.getTime() > maxCountRangeDays * dayMs) {
      throw invalidBody({ from: [`from must be at most ${maxCountRangeDays} days before to`] });
    }
    const rows = await this.prisma.evaluationCount.findMany({
      where: {
        environment: { projectId: project.id },
        ...(environment ? { environmentId: environment.id } : {}),
        minute: { gte: from, lt: to },
      },
      select: {
        variationIndex: true,
        minute: true,
        count: true,
        flag: { select: { key: true } },
        environment: { select: { key: true } },
      },
      orderBy: [
        { minute: 'asc' },
        { environment: { key: 'asc' } },
        { flag: { key: 'asc' } },
        { variationIndex: 'asc' },
      ],
    });
    return rows.map((row) => ({
      flagKey: row.flag.key,
      environmentKey: row.environment.key,
      variationIndex: row.variationIndex,
      minute: row.minute,
      count: row.count,
    }));
  }

  /**
   * The seen contexts of an environment, most recently seen first, up to `limit` (default 100): only those whose
   * `user_id` contains `userId` (ignoring case), when given.
   */
  async seenContexts(
    projectKey: string,
    environmentKey: string,
    query: SeenContextsQueryDto,
  ): Promise<StoredSeenContextDto[]> {
    const project = await this.projects.find(projectKey);
    const environment = await this.environments.find(project, environmentKey);
    const rows = await this.prisma.seenContext.findMany({
      where: {
        environmentId: environment.id,
        ...(query.userId
          ? { userId: { contains: escapeLikePattern(query.userId), mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: [{ lastSeen: 'desc' }, { id: 'asc' }],
      take: query.limit ?? defaultSeenContextsListed,
    });
    return rows.map((row) => ({
      context: {
        ...(row.userId === null ? {} : { user_id: row.userId }),
        ...(row.country === null ? {} : { country: row.country }),
      },
      lastSeen: row.lastSeen,
    }));
  }
}
