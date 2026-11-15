import { CtffModule } from '@ctff/nestjs';
import { Injectable, Module } from '@nestjs/common';
import { BirderContextResolver } from './birder-context.resolver.js';

// Any provider can configure the module, such as one that reads the environment.
@Injectable()
export class AppConfig {
  readonly evaluatorUrl = process.env['EVALUATOR_URL'] ?? 'http://evaluator:3000';
  readonly sdkKey = process.env['CTFF_SDK_KEY'] ?? '';
}

@Module({ providers: [AppConfig], exports: [AppConfig] })
export class AppConfigModule {}

@Module({
  imports: [
    CtffModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfig],
      // A missing Evaluator URL or SDK key fails the app at startup.
      useFactory: (config: AppConfig) => ({ evaluatorUrl: config.evaluatorUrl, sdkKey: config.sdkKey }),
      contextResolver: BirderContextResolver,
    }),
  ],
})
export class AppModule {}
