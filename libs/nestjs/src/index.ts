export { CtffModule, type CtffModuleAsyncOptions, type CtffModuleOptions } from './ctff.module.js';
export { CtffClient } from './ctff-client.js';
export { CTFF_CONTEXT_RESOLVER, type CtffContextResolver } from './context-resolver.js';
export { Flags, FlagsPipe } from './flags.decorator.js';
export { RequireFlag, RequireFlagGuard } from './require-flag.decorator.js';
export type {
  AllFlags,
  ClientOptions,
  Context,
  ErrorKind,
  EvaluationDetail,
  EvaluationReason,
  FlagDetail,
} from '@ctff/sdk';
