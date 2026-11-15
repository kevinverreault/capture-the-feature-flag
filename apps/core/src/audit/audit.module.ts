import { Module } from '@nestjs/common';
import { FlagsModule } from '../flags/flags.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Module({
  imports: [ProjectsModule, FlagsModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
