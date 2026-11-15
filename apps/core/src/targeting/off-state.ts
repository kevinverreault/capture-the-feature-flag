import { falseVariation, trueVariation } from '../flags/variations.js';

/**
 * The targeting every flag starts with in every environment: targeting off, off variation `false` and default
 * variation `true`. Adding a flag or an environment therefore never changes what is served anywhere.
 */
export const offStateTargeting = {
  on: false,
  offVariation: falseVariation,
  defaultVariation: trueVariation,
} as const;
