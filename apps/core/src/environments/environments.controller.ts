import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
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
  @ApiCreatedResponse({
    type: EnvironmentDto,
    description: 'Created with a generated SDK key, and with off-state targeting for every existing flag.',
  })
  create(@Param('projectKey') projectKey: string, @Body() body: CreateEnvironmentDto): Promise<EnvironmentDto> {
    return this.environments.create(projectKey, body);
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
  @ApiOkResponse({ type: EnvironmentDto })
  update(
    @Param('projectKey') projectKey: string,
    @Param('environmentKey') environmentKey: string,
    @Body() body: UpdateEnvironmentDto,
  ): Promise<EnvironmentDto> {
    return this.environments.update(projectKey, environmentKey, body);
  }

  @Delete(':environmentKey')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Deleted, with the targeting of every flag in it.' })
  delete(@Param('projectKey') projectKey: string, @Param('environmentKey') environmentKey: string): Promise<void> {
    return this.environments.delete(projectKey, environmentKey);
  }
}
