import type { IndividualTarget, Rule, TargetingSnapshot } from '@ctff/evaluation';
import type { Prisma, Targeting } from '../generated/prisma/client.js';

/**
 * The individual targets and rules are stored in JSON columns, which Prisma types loosely. They are only written
 * through {@link toTargetingJsonColumns}, after `checkTargetingChange`, so reading them back trusts their shape.
 */
interface TargetingJsonColumns {
  individualTargets: IndividualTarget[];
  rules: Rule[];
}

/** The JSON column values to write for the individual targets and rules a change sets; left out, they're kept. */
export function toTargetingJsonColumns(
  change: Partial<TargetingJsonColumns>,
): Partial<Record<keyof TargetingJsonColumns, Prisma.InputJsonArray>> {
  return {
    individualTargets: change.individualTargets as unknown as Prisma.InputJsonArray | undefined,
    rules: change.rules as unknown as Prisma.InputJsonArray | undefined,
  };
}

function fromTargetingJsonColumns(targeting: Targeting): TargetingJsonColumns {
  return {
    individualTargets: targeting.individualTargets as unknown as IndividualTarget[],
    rules: targeting.rules as unknown as Rule[],
  };
}

/** A targeting row in the shape of the shared snapshot type. */
export function toTargetingSnapshot(targeting: Targeting): TargetingSnapshot {
  return {
    on: targeting.on,
    offVariation: targeting.offVariation,
    defaultVariation: targeting.defaultVariation,
    ...fromTargetingJsonColumns(targeting),
    version: targeting.version,
  };
}
