import { Module } from '@nestjs/common';
import { EnvironmentListService } from './environment-list.service.js';
import { EvaluatorController } from './evaluator.controller.js';
import { SnapshotService } from './snapshot.service.js';

@Module({
  controllers: [EvaluatorController],
  providers: [EnvironmentListService, SnapshotService],
})
export class EvaluatorModule {}
