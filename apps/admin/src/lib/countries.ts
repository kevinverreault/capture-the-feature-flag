import { countryCodes } from '@ctff/evaluation';

/** A country a `country` rule can list: its ISO 3166-1 alpha-2 code, and its English name. */
export interface CountryOption {
  code: string;
  name: string;
}

const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'code' });

/** Every country a rule can list, by English name: only assigned ISO 3166-1 alpha-2 codes. */
export const countryOptions: readonly CountryOption[] = countryCodes
  .map((code) => ({ code, name: names.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));
