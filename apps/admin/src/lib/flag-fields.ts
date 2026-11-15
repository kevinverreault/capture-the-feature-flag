import { textField } from './forms.js';
import { formatTags, parseTags } from './tags.js';

/** What the flag fields' inputs show (see FlagFields.astro): the tags as typed, separated by commas. */
export interface FlagFieldValues {
  name: string;
  description: string;
  tags: string;
}

/** The parts of a flag the flag fields edit. */
export interface FlagFieldsOf {
  name: string;
  description: string;
  tags: readonly string[];
}

/**
 * What the flag fields show: each submitted value (`submitted` reads one, undefined when there was none), else the
 * flag as it is, else nothing for a new flag.
 */
export function flagFieldValues(
  submitted: (name: keyof FlagFieldValues) => string | undefined,
  flag?: FlagFieldsOf,
): FlagFieldValues {
  return {
    name: submitted('name') ?? flag?.name ?? '',
    description: submitted('description') ?? flag?.description ?? '',
    tags: submitted('tags') ?? (flag ? formatTags(flag.tags) : ''),
  };
}

/** The name, description and tags of a submitted flag form, as Core takes them on create and edit. */
export function flagFieldsBody(form: FormData): { name: string; description: string; tags: string[] } {
  return {
    name: textField(form, 'name'),
    description: textField(form, 'description'),
    tags: parseTags(textField(form, 'tags')),
  };
}
