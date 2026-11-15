/** The page of a species. */
export function speciesHref(speciesId: string): string {
  return `/species/${encodeURIComponent(speciesId)}`;
}

const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const regions = new Intl.DisplayNames(['en'], { type: 'region' });

/** When a sighting was observed, for people: "Nov 14, 2026, 4:40 PM UTC". */
export function formatObservedAt(iso: string): string {
  return `${dateTime.format(new Date(iso))} UTC`;
}

/** A country's name from its ISO 3166-1 alpha-2 code, or the code itself when it is unknown. */
export function countryName(code: string): string {
  try {
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}
