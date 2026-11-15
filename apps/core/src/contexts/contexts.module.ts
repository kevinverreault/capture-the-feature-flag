import { Module } from '@nestjs/common';
import { EnvironmentsModule } from '../environments/environments.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ContextAttributesController } from './context-attributes.controller.js';
import { ContextAttributesService } from './context-attributes.service.js';
import { ContextEvaluationController } from './context-evaluation.controller.js';
import { ContextEvaluationService } from './context-evaluation.service.js';

/** Contexts: the context attributes they carry, and what every flag serves one (the Contexts explorer). */
@Module({
  imports: [ProjectsModule, EnvironmentsModule],
  controllers: [ContextAttributesController, ContextEvaluationController],
  providers: [ContextAttributesService, ContextEvaluationService],
})
export class ContextsModule {}
