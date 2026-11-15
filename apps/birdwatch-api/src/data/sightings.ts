import type { Sighting } from '@ctff/birdwatch-contract';

export type { Sighting };

/** The sightings the feed starts with. Sightings logged while the API runs are added to them, in memory only. */
export const mockSightings: readonly Sighting[] = [
  {
    id: 'seed-1',
    speciesId: 'snowy-owl',
    birderId: 'alice',
    location: 'Tommy Thompson Park, Toronto',
    count: 1,
    notes: 'Perched on a lamp post at the end of the spit, hunting at dusk.',
    observedAt: '2026-11-14T16:40:00.000Z',
  },
  {
    id: 'seed-2',
    speciesId: 'eurasian-spoonbill',
    birderId: 'bram',
    location: 'Oostvaardersplassen',
    count: 14,
    notes: 'Feeding together in the shallows by the Grote Praambult hide.',
    observedAt: '2026-11-14T09:15:00.000Z',
  },
  {
    id: 'seed-3',
    speciesId: 'greater-flamingo',
    birderId: 'chiara',
    location: 'Valli di Comacchio',
    count: 230,
    notes: '',
    observedAt: '2026-11-13T14:05:00.000Z',
  },
  {
    id: 'seed-4',
    speciesId: 'great-blue-heron',
    birderId: 'dev',
    location: 'Boundary Bay dyke trail',
    count: 3,
    notes: 'Standing in the drainage ditch at low tide.',
    observedAt: '2026-11-13T18:30:00.000Z',
  },
  {
    id: 'seed-5',
    speciesId: 'white-tailed-eagle',
    birderId: 'bram',
    location: 'Lauwersmeer',
    count: 2,
    notes: 'An adult pair over the reed beds, flushing every goose in sight.',
    observedAt: '2026-11-12T11:20:00.000Z',
  },
  {
    id: 'seed-6',
    speciesId: 'black-capped-chickadee',
    birderId: 'alice',
    location: 'Point Pelee, Tip Trail',
    count: 8,
    notes: 'A noisy mixed flock with two kinglets.',
    observedAt: '2026-11-12T08:10:00.000Z',
  },
  {
    id: 'seed-7',
    speciesId: 'european-bee-eater',
    birderId: 'chiara',
    location: 'Po Delta, Scardovari',
    count: 6,
    notes: 'Late migrants hawking over the sand bank.',
    observedAt: '2026-11-11T10:45:00.000Z',
  },
  {
    id: 'seed-8',
    speciesId: 'common-loon',
    birderId: 'dev',
    location: 'Semiahmoo Bay',
    count: 4,
    notes: '',
    observedAt: '2026-11-10T15:00:00.000Z',
  },
];
