import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Actor, RecordsAudit } from '../audit/actor.js';
import { CreateEnvironmentDto, EnvironmentDto, UpdateEnvironmentDto } from './environments.dto.js';
import { EnvironmentsService } from './environments.service.js';

@ApiTags('environments')
@Controller('projects/:projectKey/environments')
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  @Get()
  @ApiOkResponse({ type: [EnvironmentDto] })
  list(@Param('projectKey') projectKey: string): Promise<EnvironmentDto[]> {
    return this.environments.list(projectKey);
  }

  @Post()
  @RecordsAudit()
  @ApiCreatedResponse({
    type: EnvironmentDto,
    description: 'Created with a generated SDK key, and with off-state targeting for every existing flag.',
  })
  create(
    @Param('projectKey') projectKey: string,
    @Body() body: CreateEnvironmentDto,
    @Actor() actor: string,
  ): Promise<EnvironmentDto> {
    return this.environments.create(projectKey, body, actor);
  }

  @Get(':environmentKey')
  @ApiOkResponse({ type: EnvironmentDto })
  get(
    @Param('projectKey') projectKey: string,
    @Param('environmentKey') environmentKey: string,
  ): Promise<EnvironmentDto> {
    return this.environments.get(projectKey, environmentKey);
  }

  @Patch(':environmentKey')
  @RecordsAudit()
  @ApiOkResponse({ type: EnvironmentDto })
  update(
    @Param('projectKey') projectKey: string,
    @Param('environmentKey') environmentKey: string,
    @Body() body: UpdateEnvironmentDto,
    @Actor() actor: string,
  ): Promise<EnvironmentDto> {
    return this.environments.update(projectKey, environmentKey, body, actor);
  }

  @Delete(':environmentKey')
  @HttpCode(204)
  @RecordsAudit()
  @ApiNoContentResponse({ description: 'Deleted, with the targeting of every flag in it.' })
  delete(
    @Param('projectKey') projectKey: string,
    @Param('environmentKey') environmentKey: string,
    @Actor() actor: string,
  ): Promise<void> {
    return this.environments.delete(projectKey, environmentKey, actor);
  }
}
