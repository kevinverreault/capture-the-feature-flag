import { Injectable } from '@nestjs/common';
import { invalidBody } from '../common/validation.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuditEntry, Prisma } from '../generated/prisma/client.js';
import type { AuditEntryDto, AuditEntryPageDto, ListAuditEntriesQuery } from './audit.dto.js';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A page of audit entries, newest first, of a project key or one of its flag keys (or of everything). Entries
   * are matched by the keys they recorded, so they stay listed after what they are about is deleted, and a flag
   * key's history goes on across a delete and a new flag with the same key.
   */
  async list(query: ListAuditEntriesQuery): Promise<AuditEntryPageDto> {
    if (query.flagKey !== undefined && query.projectKey === undefined) {
      throw invalidBody({ projectKey: ['projectKey is required to filter by flagKey'] });
    }
    const where: Prisma.AuditEntryWhereInput = { projectKey: query.projectKey, flagKey: query.flagKey };
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
