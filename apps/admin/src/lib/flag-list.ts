/** What the flag list's search and tag filter look at. */
export interface ListedFlag {
  key: string;
  name: string;
  tags: readonly string[];
  /** Archived flags are hidden unless the filter shows them. */
  archived?: boolean;
}

export interface FlagFilter {
  /** Text to find in the flag key or name, ignoring case; blank finds every flag. */
  search?: string | undefined;
  /** A tag the flag must carry, ignoring case; blank keeps every flag. */
  tag?: string | undefined;
  /** Whether archived flags are listed too; they are hidden by default. */
  showArchived?: boolean | undefined;
}

/** The flags matching the flag list's search, tag filter and "show archived", in their original order. */
export function filterFlags<T extends ListedFlag>(flags: readonly T[], { search, tag, showArchived }: FlagFilter): T[] {
  const needle = search?.trim().toLowerCase() ?? '';
  return flags.filter(
    (flag) =>
      (showArchived === true || flag.archived !== true) &&
      (!tag || flag.tags.some((flagTag) => sameTag(flagTag, tag))) &&
      (needle === '' || flag.key.toLowerCase().includes(needle) || flag.name.toLowerCase().includes(needle)),
  );
}

/** Every tag of the flags once, alphabetically: the choices of the tag filter. */
export function listedTags(flags: readonly ListedFlag[]): string[] {
  return [...new Set(flags.flatMap((flag) => flag.tags))].sort((a, b) => a.localeCompare(b));
}

/** Whether two tags are the same, ignoring case, as the tag filter compares them. */
export function sameTag(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The flag list's caption: how many flags it shows (out of how many, while filtered). */
export function flagListCaption(shown: number, total: number, filtered: boolean): string {
  const count = filtered ? `${shown} of ${total}` : `${total}`;
  return `${count} ${total === 1 ? 'flag' : 'flags'}, with targeting on or off in each environment`;
}
