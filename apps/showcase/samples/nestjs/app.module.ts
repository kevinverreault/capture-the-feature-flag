import { CtffModule } from '@ctff/nestjs';
import { Module } from '@nestjs/common';
import { BirderContextResolver } from './birder-context.resolver.js';
import { SightingController } from './sighting.controller.js';

// Imported once, in the root module. It is global, so CtffClient, @Flags() and @RequireFlag work in every module.
@Module({
  imports: [
    CtffModule.forRoot({
      evaluatorUrl: 'http://evaluator:3000',
      sdkKey: 'ctff-env-…',
      timeoutMs: 500, // optional; this is the default
      contextResolver: BirderContextResolver,
    }),
  ],
  controllers: [SightingController],
})
export class AppModule {}
