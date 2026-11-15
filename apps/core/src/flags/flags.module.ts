import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { FlagsController } from './flags.controller.js';
import { FlagsService } from './flags.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [FlagsController],
  providers: [FlagsService],
  exports: [FlagsService],
})
export class FlagsModule {}
