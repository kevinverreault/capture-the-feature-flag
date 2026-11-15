import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiConflictResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TargetingDto, UpdateTargetingDto } from './targeting.dto.js';
import { TargetingService } from './targeting.service.js';

@ApiTags('targeting')
@Controller('projects/:projectKey/flags/:flagKey/targeting')
export class TargetingController {
  constructor(private readonly targeting: TargetingService) {}

  @Get()
  @ApiOkResponse({ type: [TargetingDto], description: "The flag's targeting in every environment." })
  list(@Param('projectKey') projectKey: string, @Param('flagKey') flagKey: string): Promise<TargetingDto[]> {
    return this.targeting.list(projectKey, flagKey);
  }

  @Get(':environmentKey')
  @ApiOkResponse({ type: TargetingDto })
  get(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Param('environmentKey') environmentKey: string,
  ): Promise<TargetingDto> {
    return this.targeting.get(projectKey, flagKey, environmentKey);
  }

  @Patch(':environmentKey')
  @ApiOkResponse({ type: TargetingDto })
  @ApiConflictResponse({ description: 'The targeting changed since the version the change is based on.' })
  update(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Param('environmentKey') environmentKey: string,
    @Body() body: UpdateTargetingDto,
  ): Promise<TargetingDto> {
    return this.targeting.update(projectKey, flagKey, environmentKey, body);
  }
}
