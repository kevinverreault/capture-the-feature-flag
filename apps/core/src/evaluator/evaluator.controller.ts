import { sdkKeyHeader } from '@ctff/evaluation';
import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { EnvironmentListDto } from './environment-list.dto.js';
import { EnvironmentListService } from './environment-list.service.js';
import { sendWithEtag } from './json-with-etag.js';
import { EnvironmentSnapshotDto } from './snapshot.dto.js';
import { SnapshotService } from './snapshot.service.js';
import { TelemetryBatchDto } from '../telemetry/telemetry.dto.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';

/** The endpoints Evaluators call (ADR 0001). */
@ApiTags('evaluator')
@Controller('evaluator')
export class EvaluatorController {
  constructor(
    private readonly environmentList: EnvironmentListService,
    private readonly snapshots: SnapshotService,
    private readonly telemetry: TelemetryService,
  ) {}

  /** Evaluators poll this list to learn which environments to keep a snapshot of. */
  @Get('environments')
  @ApiHeader({ name: 'If-None-Match', required: false, description: 'The ETag of the list already held.' })
  @ApiOkResponse({ type: EnvironmentListDto, description: 'Every environment of every project, with an ETag.' })
  @ApiResponse({ status: 304, description: 'The list has not changed since the ETag in If-None-Match.' })
  async environments(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    sendWithEtag(response, await this.environmentList.list(), ifNoneMatch);
  }

  /**
   * The SDK key travels in a header rather than the path, so it stays out of access logs and URLs; it becomes a
   * credential once authentication arrives.
   */
  @Get('snapshot')
  @ApiHeader({ name: sdkKeyHeader, required: true, description: 'The SDK key of the environment.' })
  @ApiHeader({ name: 'If-None-Match', required: false, description: 'The ETag of the snapshot already held.' })
  @ApiOkResponse({
    type: EnvironmentSnapshotDto,
    description: "The targeting of every flag in the SDK key's environment, with an ETag.",
  })
  @ApiResponse({ status: 304, description: 'The snapshot has not changed since the ETag in If-None-Match.' })
  @ApiBadRequestResponse({ description: `No ${sdkKeyHeader} header.` })
  @ApiNotFoundResponse({ description: 'Unknown SDK key.' })
  async snapshot(
    @Headers(sdkKeyHeader) sdkKey: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    if (!sdkKey) throw new BadRequestException(`The ${sdkKeyHeader} header is required`);
    const snapshot = await this.snapshots.forSdkKey(sdkKey);
    response.setHeader('Vary', sdkKeyHeader);
    sendWithEtag(response, snapshot, ifNoneMatch);
  }

  /**
   * Evaluators send the evaluation counts and seen contexts they added up about every minute. Counts are added to
   * the stored ones; telemetry for an SDK key, flag or variation that no longer exists is skipped.
   */
  @Post('telemetry')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Stored.' })
  @ApiBadRequestResponse({ description: 'A malformed batch; none of it is stored.' })
  ingest(@Body() batch: TelemetryBatchDto): Promise<void> {
    return this.telemetry.ingest(batch);
  }
}
