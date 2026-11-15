import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ContextEvaluationDto, EvaluateContextDto } from './context-evaluation.dto.js';
import { ContextEvaluationService } from './context-evaluation.service.js';

/** What each flag serves a context, for the admin's Contexts explorer. */
@ApiTags('contexts')
@Controller('projects/:projectKey/environments/:environmentKey')
export class ContextEvaluationController {
  constructor(private readonly evaluations: ContextEvaluationService) {}

  /**
   * Evaluates every flag of the project that is not archived for the context, against the environment's current
   * targeting, with the same evaluation library as the Evaluator. Changes nothing, and records no telemetry.
   */
  @Post('evaluate')
  @HttpCode(200)
  @ApiOkResponse({ type: ContextEvaluationDto })
  @ApiBadRequestResponse({ description: 'A missing or malformed context.' })
  @ApiNotFoundResponse({ description: 'Unknown project or environment.' })
  evaluate(
    @Param('projectKey') projectKey: string,
    @Param('environmentKey') environmentKey: string,
    @Body() body: EvaluateContextDto,
  ): Promise<ContextEvaluationDto> {
    return this.evaluations.evaluateAll(projectKey, environmentKey, body.context);
  }
}
