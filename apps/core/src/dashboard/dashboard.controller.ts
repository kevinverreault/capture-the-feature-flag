import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DashboardSummaryDto, EvaluationSeriesDto, EvaluationSeriesQueryDto, StaleFlagsDto } from './dashboard.dto.js';
import { DashboardService } from './dashboard.service.js';

/** What the admin app's dashboard shows of a project. */
@ApiTags('dashboard')
@Controller('projects/:projectKey/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOkResponse({
    type: DashboardSummaryDto,
    description: 'The flag counts, and how many flags are on and off in each environment.',
  })
  summary(@Param('projectKey') projectKey: string): Promise<DashboardSummaryDto> {
    return this.dashboard.summary(projectKey);
  }

  @Get('evaluations')
  @ApiOkResponse({
    type: EvaluationSeriesDto,
    description:
      'The evaluations of the last 24 hours (hourly buckets) or 7 days (6-hour buckets), per flag, environment and ' +
      'variation, from the stored count buckets.',
  })
  evaluations(
    @Param('projectKey') projectKey: string,
    @Query() query: EvaluationSeriesQueryDto,
  ): Promise<EvaluationSeriesDto> {
    return this.dashboard.evaluations(projectKey, query);
  }

  @Get('stale-flags')
  @ApiOkResponse({
    type: StaleFlagsDto,
    description:
      'The flags with no evaluations in any environment for the stale-flag threshold of the settings. Archived ' +
      'flags, and flags younger than the threshold, are left out.',
  })
  staleFlags(@Param('projectKey') projectKey: string): Promise<StaleFlagsDto> {
    return this.dashboard.staleFlags(projectKey);
  }
}
