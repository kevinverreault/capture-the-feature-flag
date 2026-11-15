import { Module } from '@nestjs/common';
import { EnvironmentsModule } from '../environments/environments.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { RetentionService } from './retention.service.js';
import { TelemetryController } from './telemetry.controller.js';
import { TelemetryService } from './telemetry.service.js';

@Module({
  imports: [ProjectsModule, EnvironmentsModule, SettingsModule],
  controllers: [TelemetryController],
  providers: [TelemetryService, RetentionService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
