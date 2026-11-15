import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FlagListItemDto } from './flag-list.dto.js';
import { CreateFlagDto, FlagDto, UpdateFlagDto } from './flags.dto.js';
import { FlagsService } from './flags.service.js';

@ApiTags('flags')
@Controller('projects/:projectKey/flags')
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @Get()
  @ApiOkResponse({ type: [FlagListItemDto], description: 'By key, each with its targeting on or off per environment.' })
  list(@Param('projectKey') projectKey: string): Promise<FlagListItemDto[]> {
    return this.flags.list(projectKey);
  }

  @Post()
  @ApiCreatedResponse({
    type: FlagDto,
    description:
      'Created with off-state targeting in every environment: targeting off, off variation false, default variation true.',
  })
  @ApiConflictResponse({ description: 'The flag key is already used in this project.' })
  create(@Param('projectKey') projectKey: string, @Body() body: CreateFlagDto): Promise<FlagDto> {
    return this.flags.create(projectKey, body);
  }

  @Get(':flagKey')
  @ApiOkResponse({ type: FlagDto })
  get(@Param('projectKey') projectKey: string, @Param('flagKey') flagKey: string): Promise<FlagDto> {
    return this.flags.get(projectKey, flagKey);
  }

  @Patch(':flagKey')
  @ApiOkResponse({ type: FlagDto })
  @ApiConflictResponse({ description: 'The flag changed since the version the edit is based on.' })
  update(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Body() body: UpdateFlagDto,
  ): Promise<FlagDto> {
    return this.flags.update(projectKey, flagKey, body);
  }

  @Delete(':flagKey')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Deleted, with its targeting in every environment.' })
  delete(@Param('projectKey') projectKey: string, @Param('flagKey') flagKey: string): Promise<void> {
    return this.flags.delete(projectKey, flagKey);
  }
}
