import { sdkKeyHeader } from '@ctff/evaluation';
import { BadRequestException, Controller, Get, Headers, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { EnvironmentListDto, EnvironmentSnapshotDto } from './snapshot.dto.js';
import { matchesIfNoneMatch, type Serialized, SnapshotService } from './snapshot.service.js';

/** The endpoints Evaluators call (ADR 0001). */
@ApiTags('evaluator')
@Controller('evaluator')
export class EvaluatorController {
  constructor(private readonly snapshots: SnapshotService) {}

  /** Evaluators poll this list to learn which environments to keep a snapshot of. */
  @Get('environments')
  @ApiHeader({ name: 'If-None-Match', required: false, description: 'The ETag of the list already held.' })
  @ApiOkResponse({ type: EnvironmentListDto, description: 'Every environment of every project, with an ETag.' })
  @ApiResponse({ status: 304, description: 'The list has not changed since the ETag in If-None-Match.' })
  async environments(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    send(response, await this.snapshots.environments(), ifNoneMatch);
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
    send(response, snapshot, ifNoneMatch);
  }
}

/** Sends the body with its ETag, or `304 Not Modified` when If-None-Match already names it. */
function send(response: Response, { json, etag }: Serialized, ifNoneMatch: string | undefined): void {
  response.setHeader('ETag', etag);
  response.setHeader('Cache-Control', 'no-cache');
  if (matchesIfNoneMatch(ifNoneMatch, etag)) {
    response.status(304).end();
    return;
  }
  response.status(200).type('application/json').send(json);
}
