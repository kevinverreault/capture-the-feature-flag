/** What the flag list's search and tag filter look at. */
export interface ListedFlag {
  key: string;
  name: string;
  tags: readonly string[];
}

export interface FlagFilter {
  /** Text to find in the flag key or name, ignoring case; blank finds every flag. */
  search?: string | undefined;
  /** A tag the flag must carry; blank keeps every flag. */
  tag?: string | undefined;
}

/** The flags matching the flag list's search and tag filter, in their original order. */
export function filterFlags<T extends ListedFlag>(flags: readonly T[], { search, tag }: FlagFilter): T[] {
  const needle = search?.trim().toLowerCase() ?? '';
  return flags.filter(
    (flag) =>
      (!tag || flag.tags.includes(tag)) &&
      (needle === '' || flag.key.toLowerCase().includes(needle) || flag.name.toLowerCase().includes(needle)),
  );
}

/** Every tag of the flags once, alphabetically: the choices of the tag filter. */
export function listedTags(flags: readonly ListedFlag[]): string[] {
  return [...new Set(flags.flatMap((flag) => flag.tags))].sort((a, b) => a.localeCompare(b));
}
