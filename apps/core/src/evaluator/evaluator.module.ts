import { Module } from '@nestjs/common';
import { EnvironmentListService } from './environment-list.service.js';
import { EvaluatorController } from './evaluator.controller.js';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { SnapshotService } from './snapshot.service.js';

@Module({
  imports: [TelemetryModule],
  controllers: [EvaluatorController],
  providers: [EnvironmentListService, SnapshotService],
})
export class EvaluatorModule {}
