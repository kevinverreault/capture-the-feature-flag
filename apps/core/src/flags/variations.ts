import type { Variation } from '@ctff/evaluation';

/** Every V1 flag is boolean, stored as the variations [true, false] and referred to by index (ADR 0002). */
export const booleanVariations: readonly Variation[] = [true, false];
export const trueVariation = 0;
export const falseVariation = 1;
