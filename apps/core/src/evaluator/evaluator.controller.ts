import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import { ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { EnvironmentSnapshotDto } from './snapshot.dto.js';
import { matchesIfNoneMatch, SnapshotService } from './snapshot.service.js';

/** The endpoints Evaluators call (ADR 0001). */
@ApiTags('evaluator')
@Controller('evaluator')
export class EvaluatorController {
  constructor(private readonly snapshots: SnapshotService) {}

  @Get('snapshots/:sdkKey')
  @ApiHeader({ name: 'If-None-Match', required: false, description: 'The ETag of the snapshot already held.' })
  @ApiOkResponse({
    type: EnvironmentSnapshotDto,
    description: "The targeting of every flag in the SDK key's environment, with an ETag.",
  })
  @ApiResponse({ status: 304, description: 'The snapshot has not changed since the ETag in If-None-Match.' })
  @ApiNotFoundResponse({ description: 'Unknown SDK key.' })
  async snapshot(
    @Param('sdkKey') sdkKey: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const { json, etag } = await this.snapshots.forSdkKey(sdkKey);
    response.setHeader('ETag', etag);
    response.setHeader('Cache-Control', 'no-cache');
    if (matchesIfNoneMatch(ifNoneMatch, etag)) {
      response.status(304).end();
      return;
    }
    response.status(200).type('application/json').send(json);
  }
}
