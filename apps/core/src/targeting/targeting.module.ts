import { Module } from '@nestjs/common';
import { EnvironmentsModule } from '../environments/environments.module.js';
import { FlagsModule } from '../flags/flags.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TargetingController } from './targeting.controller.js';
import { TargetingService } from './targeting.service.js';

@Module({
  imports: [ProjectsModule, EnvironmentsModule, FlagsModule],
  controllers: [TargetingController],
  providers: [TargetingService],
})
export class TargetingModule {}
