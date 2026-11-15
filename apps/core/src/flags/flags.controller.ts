import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Actor, RecordsAudit } from '../audit/actor.js';
import { FlagListItemDto, FlagListQueryDto } from './flag-list.dto.js';
import { CreateFlagDto, FlagDto, UpdateFlagDto } from './flags.dto.js';
import { FlagsService } from './flags.service.js';

@ApiTags('flags')
@Controller('projects/:projectKey/flags')
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @Get()
  @ApiOkResponse({
    type: [FlagListItemDto],
    description: 'By key, each with its targeting on or off per environment. Archived flags only when asked for.',
  })
  list(@Param('projectKey') projectKey: string, @Query() query: FlagListQueryDto): Promise<FlagListItemDto[]> {
    return this.flags.list(projectKey, { includeArchived: query.includeArchived ?? false });
  }

  @Post()
  @RecordsAudit()
  @ApiCreatedResponse({
    type: FlagDto,
    description:
      'Created with off-state targeting in every environment: targeting off, off variation false, default variation true.',
  })
  @ApiConflictResponse({ description: 'The flag key is already used in this project.' })
  create(
    @Param('projectKey') projectKey: string,
    @Body() body: CreateFlagDto,
    @Actor() actor: string,
  ): Promise<FlagDto> {
    return this.flags.create(projectKey, body, actor);
  }

  @Get(':flagKey')
  @ApiOkResponse({ type: FlagDto })
  get(@Param('projectKey') projectKey: string, @Param('flagKey') flagKey: string): Promise<FlagDto> {
    return this.flags.get(projectKey, flagKey);
  }

  @Patch(':flagKey')
  @RecordsAudit()
  @ApiOkResponse({ type: FlagDto })
  @ApiConflictResponse({ description: 'The flag changed since the version the edit is based on, or is archived.' })
  update(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Body() body: UpdateFlagDto,
    @Actor() actor: string,
  ): Promise<FlagDto> {
    return this.flags.update(projectKey, flagKey, body, actor);
  }

  @Post(':flagKey/archive')
  @RecordsAudit()
  @HttpCode(200)
  @ApiOkResponse({
    type: FlagDto,
    description:
      'Archived: hidden from the flag list and left out of snapshots, with its targeting kept for a restore. ' +
      'Archiving an archived flag changes nothing.',
  })
  archive(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Actor() actor: string,
  ): Promise<FlagDto> {
    return this.flags.archive(projectKey, flagKey, actor);
  }

  @Post(':flagKey/restore')
  @RecordsAudit()
  @HttpCode(200)
  @ApiOkResponse({
    type: FlagDto,
    description:
      'Restored: listed and served again, with the targeting it had when archived. ' +
      "Restoring a flag that isn't archived changes nothing.",
  })
  restore(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Actor() actor: string,
  ): Promise<FlagDto> {
    return this.flags.restore(projectKey, flagKey, actor);
  }

  @Delete(':flagKey')
  @HttpCode(204)
  @RecordsAudit()
  @ApiNoContentResponse({ description: 'Permanently deleted, with its targeting in every environment.' })
  @ApiConflictResponse({ description: 'The flag is not archived: only an archived flag can be deleted.' })
  delete(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Actor() actor: string,
  ): Promise<void> {
    return this.flags.delete(projectKey, flagKey, actor);
  }
}
