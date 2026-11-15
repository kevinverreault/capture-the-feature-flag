import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Actor, RecordsAudit } from '../audit/actor.js';
import { CreateProjectDto, ProjectDto, UpdateProjectDto } from './projects.dto.js';
import { ProjectsService } from './projects.service.js';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOkResponse({ type: [ProjectDto] })
  list(): Promise<ProjectDto[]> {
    return this.projects.list();
  }

  @Post()
  @RecordsAudit()
  @ApiCreatedResponse({ type: ProjectDto })
  create(@Body() body: CreateProjectDto, @Actor() actor: string): Promise<ProjectDto> {
    return this.projects.create(body, actor);
  }

  @Get(':projectKey')
  @ApiOkResponse({ type: ProjectDto })
  get(@Param('projectKey') projectKey: string): Promise<ProjectDto> {
    return this.projects.get(projectKey);
  }

  @Patch(':projectKey')
  @RecordsAudit()
  @ApiOkResponse({ type: ProjectDto })
  update(
    @Param('projectKey') projectKey: string,
    @Body() body: UpdateProjectDto,
    @Actor() actor: string,
  ): Promise<ProjectDto> {
    return this.projects.update(projectKey, body, actor);
  }

  @Delete(':projectKey')
  @HttpCode(204)
  @RecordsAudit()
  @ApiNoContentResponse({ description: 'Deleted, with its environments, flags and targeting.' })
  delete(@Param('projectKey') projectKey: string, @Actor() actor: string): Promise<void> {
    return this.projects.delete(projectKey, actor);
  }
}
