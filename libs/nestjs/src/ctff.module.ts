import { type ClientOptions, createClient } from '@ctff/sdk';
import {
  type DynamicModule,
  type FactoryProvider,
  Module,
  type ModuleMetadata,
  type Provider,
  type Type,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CTFF_CONTEXT_RESOLVER, type CtffContextResolver } from './context-resolver.js';
import { CtffClient } from './ctff-client.js';
import { FlagsLoader } from './flags.decorator.js';
import { RequestFlags } from './request-flags.js';

const CTFF_CLIENT_OPTIONS = Symbol('CTFF_CLIENT_OPTIONS');

/** The app's context resolver, and the modules whose exported providers it (or a factory) injects. */
interface CtffResolverOptions extends Pick<ModuleMetadata, 'imports'> {
  /** The app's `CtffContextResolver` class, for `@Flags()` and `@RequireFlag`. */
  contextResolver: Type<CtffContextResolver>;
}

/** The SDK's options, and the app's context resolver. */
export interface CtffModuleOptions extends ClientOptions, CtffResolverOptions {}

/** The SDK's options from a factory that can inject providers (such as the app's configuration). */
export interface CtffModuleAsyncOptions extends CtffResolverOptions {
  inject?: FactoryProvider['inject'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the factory's parameters are what `inject` names.
  useFactory: (...args: any[]) => ClientOptions | Promise<ClientOptions>;
}

/**
 * Configures the SDK once for the whole app: the module is global, so `CtffClient`, `@Flags()` and `@RequireFlag`
 * work in every module. A configuration mistake (no Evaluator URL or SDK key) fails the app at startup. The context
 * resolver is created inside this module, so it can inject global providers and those of the modules in `imports`.
 */
@Module({})
export class CtffModule {
  static forRoot(options: CtffModuleOptions): DynamicModule {
    const { contextResolver, imports, ...clientOptions } = options;
    return CtffModule.create({ provide: CTFF_CLIENT_OPTIONS, useValue: clientOptions }, contextResolver, imports);
  }

  static forRootAsync(options: CtffModuleAsyncOptions): DynamicModule {
    const { imports = [], inject = [], useFactory, contextResolver } = options;
    return CtffModule.create({ provide: CTFF_CLIENT_OPTIONS, useFactory, inject }, contextResolver, imports);
  }

  private static create(
    clientOptions: Provider,
    contextResolver: Type<CtffContextResolver>,
    imports: ModuleMetadata['imports'] = [],
  ): DynamicModule {
    return {
      module: CtffModule,
      global: true,
      imports,
      providers: [
        clientOptions,
        { provide: CtffClient, useFactory: createClient, inject: [CTFF_CLIENT_OPTIONS] },
        { provide: CTFF_CONTEXT_RESOLVER, useClass: contextResolver },
        RequestFlags,
        { provide: APP_INTERCEPTOR, useClass: FlagsLoader },
      ],
      exports: [CtffClient, CTFF_CONTEXT_RESOLVER, RequestFlags],
    };
  }
}
