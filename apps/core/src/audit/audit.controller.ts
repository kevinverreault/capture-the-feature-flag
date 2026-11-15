import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuditEntryPageDto, ListAuditEntriesQuery } from './audit.dto.js';
import { AuditService } from './audit.service.js';

@ApiTags('audit')
@Controller('audit-entries')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOkResponse({
    type: AuditEntryPageDto,
    description: 'Newest first, a page at a time: pass nextCursor as cursor to get the next (older) page.',
  })
  list(@Query() query: ListAuditEntriesQuery): Promise<AuditEntryPageDto> {
    return this.audit.list(query);
  }
}
