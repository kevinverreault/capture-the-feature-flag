/**
 * The mock behind "Photo ID (beta)": a species for a photo, picked from a hash of its bytes (FNV-1a), so the same
 * photo always gets the same suggestion. There is no model behind it: it demos a flag, not image recognition.
 */
export function suggestSpecies<T>(photo: Uint8Array, species: readonly T[]): T | undefined {
  if (photo.length === 0 || species.length === 0) return undefined;
  let hash = 0x811c9dc5;
  for (const byte of photo) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return species[hash % species.length];
}
