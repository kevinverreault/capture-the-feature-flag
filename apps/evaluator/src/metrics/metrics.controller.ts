import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { EvaluatorMetrics } from './evaluator-metrics.js';

/** Prometheus scrapes, outside /api/v1. */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: EvaluatorMetrics) {}

  @Get()
  @Header('cache-control', 'no-store')
  async scrape(@Res({ passthrough: true }) response: Response): Promise<string> {
    response.type(this.metrics.registry.contentType);
    return this.metrics.registry.metrics();
  }
}
