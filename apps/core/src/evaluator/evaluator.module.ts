import { Module } from '@nestjs/common';
import { EvaluatorController } from './evaluator.controller.js';
import { SnapshotService } from './snapshot.service.js';

@Module({
  controllers: [EvaluatorController],
  providers: [SnapshotService],
})
export class EvaluatorModule {}
