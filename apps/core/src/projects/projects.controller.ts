import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
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
  @ApiCreatedResponse({ type: ProjectDto })
  create(@Body() body: CreateProjectDto): Promise<ProjectDto> {
    return this.projects.create(body);
  }

  @Get(':projectKey')
  @ApiOkResponse({ type: ProjectDto })
  get(@Param('projectKey') projectKey: string): Promise<ProjectDto> {
    return this.projects.get(projectKey);
  }

  @Patch(':projectKey')
  @ApiOkResponse({ type: ProjectDto })
  update(@Param('projectKey') projectKey: string, @Body() body: UpdateProjectDto): Promise<ProjectDto> {
    return this.projects.update(projectKey, body);
  }

  @Delete(':projectKey')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Deleted, with its environments, flags and targeting.' })
  delete(@Param('projectKey') projectKey: string): Promise<void> {
    return this.projects.delete(projectKey);
  }
}
