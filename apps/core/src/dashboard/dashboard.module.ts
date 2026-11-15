import { Module } from '@nestjs/common';
import { EnvironmentsModule } from '../environments/environments.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [ProjectsModule, EnvironmentsModule, SettingsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
