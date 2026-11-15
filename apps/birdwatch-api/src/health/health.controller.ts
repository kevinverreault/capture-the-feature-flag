import { Controller, Get } from '@nestjs/common';
import { Public } from '../session/auth.guard.js';

/**
 * Liveness and readiness for orchestrators, outside /api. The API only listens once it has its SDK key, and the SDK
 * falls back rather than fail when the Evaluator is unreachable, so once it answers, it is ready.
 */
@Public()
@Controller('health')
export class HealthController {
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  ready(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
