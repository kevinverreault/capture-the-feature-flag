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
import { EnvironmentSnapshotDto } from './snapshot.dto.js';
import { matchesIfNoneMatch, SnapshotService } from './snapshot.service.js';

export const sdkKeyHeader = 'x-ctff-sdk-key';

/** The endpoints Evaluators call (ADR 0001). */
@ApiTags('evaluator')
@Controller('evaluator')
export class EvaluatorController {
  constructor(private readonly snapshots: SnapshotService) {}

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
    const { json, etag } = await this.snapshots.forSdkKey(sdkKey);
    response.setHeader('ETag', etag);
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Vary', sdkKeyHeader);
    if (matchesIfNoneMatch(ifNoneMatch, etag)) {
      response.status(304).end();
      return;
    }
    response.status(200).type('application/json').send(json);
  }
}
