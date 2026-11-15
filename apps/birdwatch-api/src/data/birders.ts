import type { Birder } from '@ctff/birdwatch-contract';

export type { Birder };

export const birders: readonly Birder[] = [
  { id: 'alice', name: 'Alice Tremblay', country: 'CA', homePatch: 'Point Pelee, Ontario' },
  { id: 'bram', name: 'Bram de Vries', country: 'NL', homePatch: 'Oostvaardersplassen, Flevoland' },
  { id: 'chiara', name: 'Chiara Rossi', country: 'IT', homePatch: 'Po Delta, Veneto' },
  { id: 'dev', name: 'Dev Patel', country: 'CA', homePatch: 'Boundary Bay, British Columbia' },
];

export function findBirder(id: string): Birder | undefined {
  return birders.find((birder) => birder.id === id);
}
