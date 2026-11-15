import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  EvaluationCountBucketDto,
  EvaluationCountsQueryDto,
  SeenContextsQueryDto,
  StoredSeenContextDto,
} from './telemetry.dto.js';
import { TelemetryService } from './telemetry.service.js';

/** The evaluation telemetry Evaluators sent, as Core stored it. */
@ApiTags('telemetry')
@Controller('projects/:projectKey')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  /** The 1-minute evaluation count buckets of the project's flags, oldest first, for at most a week. */
  @Get('evaluation-counts')
  @ApiOkResponse({ type: [EvaluationCountBucketDto] })
  counts(
    @Param('projectKey') projectKey: string,
    @Query() query: EvaluationCountsQueryDto,
  ): Promise<EvaluationCountBucketDto[]> {
    return this.telemetry.counts(projectKey, query);
  }

  /** The contexts recently evaluated in the environment, most recently seen first, up to `limit`. */
  @Get('environments/:environmentKey/seen-contexts')
  @ApiOkResponse({ type: [StoredSeenContextDto] })
  seenContexts(
    @Param('projectKey') projectKey: string,
    @Param('environmentKey') environmentKey: string,
    @Query() query: SeenContextsQueryDto,
  ): Promise<StoredSeenContextDto[]> {
    return this.telemetry.seenContexts(projectKey, environmentKey, query);
  }
}
