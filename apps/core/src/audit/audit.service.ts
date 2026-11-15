import { Injectable } from '@nestjs/common';
import { invalidBody } from '../common/validation.js';
import { PrismaService } from '../database/prisma.service.js';
import { FlagsService } from '../flags/flags.service.js';
import type { AuditEntry, Prisma } from '../generated/prisma/client.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { AuditEntryDto, AuditEntryPageDto, ListAuditEntriesQuery } from './audit.dto.js';

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly flags: FlagsService,
  ) {}

  /** A page of audit entries, newest first, of a project or one of its flags (or of everything). */
  async list(query: ListAuditEntriesQuery): Promise<AuditEntryPageDto> {
    const where: Prisma.AuditEntryWhereInput = {};
    if (query.flagKey !== undefined && query.projectKey === undefined) {
      throw invalidBody({ projectKey: ['projectKey is required to filter by flagKey'] });
    }
    if (query.projectKey !== undefined) {
      const project = await this.projects.find(query.projectKey);
      where.projectId = project.id;
      if (query.flagKey !== undefined) where.flagId = (await this.flags.find(project, query.flagKey)).id;
    }
    if (query.cursor !== undefined) where.id = { lt: query.cursor };

    // One more than asked for says whether there is a next page.
    const rows = await this.prisma.auditEntry.findMany({ where, orderBy: { id: 'desc' }, take: query.limit + 1 });
    const entries = rows.slice(0, query.limit);
    return {
      entries: entries.map(toAuditEntryDto),
      nextCursor: rows.length > query.limit ? (entries.at(-1)?.id ?? null) : null,
    };
  }
}

function toAuditEntryDto(entry: AuditEntry): AuditEntryDto {
  return {
    id: entry.id,
    projectKey: entry.projectKey,
    targetType: entry.targetType,
    targetId: entry.targetId,
    flagKey: entry.flagKey,
    environmentKey: entry.environmentKey,
    action: entry.action,
    actor: entry.actor,
    before: entry.before as Record<string, unknown> | null,
    after: entry.after as Record<string, unknown> | null,
    createdAt: entry.createdAt,
  };
}
