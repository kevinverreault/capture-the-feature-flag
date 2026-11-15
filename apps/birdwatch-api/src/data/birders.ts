/** A birder of the demo. Logging in as one makes their `id` the context's `user_id`, and their `country` its country. */
export interface Birder {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Where they usually go birding, for the login screen. */
  homePatch: string;
}

export const birders: readonly Birder[] = [
  { id: 'alice', name: 'Alice Tremblay', country: 'CA', homePatch: 'Point Pelee, Ontario' },
  { id: 'bram', name: 'Bram de Vries', country: 'NL', homePatch: 'Oostvaardersplassen, Flevoland' },
  { id: 'chiara', name: 'Chiara Rossi', country: 'IT', homePatch: 'Po Delta, Veneto' },
  { id: 'dev', name: 'Dev Patel', country: 'CA', homePatch: 'Boundary Bay, British Columbia' },
];

export function findBirder(id: string): Birder | undefined {
  return birders.find((birder) => birder.id === id);
}
