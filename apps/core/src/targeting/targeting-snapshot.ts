import type { IndividualTarget, Rule, TargetingSnapshot } from '@ctff/evaluation';
import type { Targeting } from '../generated/prisma/client.js';

/** A targeting row in the shape of the shared snapshot type. The JSON columns are only written by Core. */
export function toTargetingSnapshot(targeting: Targeting): TargetingSnapshot {
  return {
    on: targeting.on,
    offVariation: targeting.offVariation,
    defaultVariation: targeting.defaultVariation,
    individualTargets: targeting.individualTargets as unknown as IndividualTarget[],
    rules: targeting.rules as unknown as Rule[],
    version: targeting.version,
  };
}
