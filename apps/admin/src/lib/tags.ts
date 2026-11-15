/** Flag tags are typed in one text input, separated by commas. */
const separator = ',';

/** The tags typed in the tags input: trimmed, without blanks, each once. */
export function parseTags(text: string): string[] {
  const tags = text.split(separator).map((tag) => tag.trim());
  return [...new Set(tags.filter((tag) => tag !== ''))];
}

/** The tags as the tags input shows them. */
export function formatTags(tags: readonly string[]): string {
  return tags.join(`${separator} `);
}
