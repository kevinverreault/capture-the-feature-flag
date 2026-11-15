export type Rarity = 'common' | 'uncommon' | 'rare';

export interface Species {
  id: string;
  commonName: string;
  scientificName: string;
  family: string;
  rarity: Rarity;
  description: string;
}

export const species: readonly Species[] = [
  {
    id: 'common-loon',
    commonName: 'Common Loon',
    scientificName: 'Gavia immer',
    family: 'Gaviidae',
    rarity: 'common',
    description: 'A large diving bird of northern lakes, known for its haunting, yodelling call.',
  },
  {
    id: 'black-capped-chickadee',
    commonName: 'Black-capped Chickadee',
    scientificName: 'Poecile atricapillus',
    family: 'Paridae',
    rarity: 'common',
    description: 'A tiny, curious songbird with a black cap and bib that calls its own name: chick-a-dee-dee-dee.',
  },
  {
    id: 'snowy-owl',
    commonName: 'Snowy Owl',
    scientificName: 'Bubo scandiacus',
    family: 'Strigidae',
    rarity: 'rare',
    description: 'A white Arctic owl that hunts by day and winters on open fields, shorelines and airports.',
  },
  {
    id: 'kirtlands-warbler',
    commonName: 'Kirtland’s Warbler',
    scientificName: 'Setophaga kirtlandii',
    family: 'Parulidae',
    rarity: 'rare',
    description: 'A grey-and-yellow warbler that nests only in young jack pine stands; a prize on migration.',
  },
  {
    id: 'great-blue-heron',
    commonName: 'Great Blue Heron',
    scientificName: 'Ardea herodias',
    family: 'Ardeidae',
    rarity: 'common',
    description: 'A tall, patient wader that stands motionless in the shallows before striking at fish.',
  },
  {
    id: 'eurasian-spoonbill',
    commonName: 'Eurasian Spoonbill',
    scientificName: 'Platalea leucorodia',
    family: 'Threskiornithidae',
    rarity: 'uncommon',
    description: 'A white wader that sweeps its spoon-shaped bill from side to side through shallow water.',
  },
  {
    id: 'bluethroat',
    commonName: 'Bluethroat',
    scientificName: 'Luscinia svecica',
    family: 'Muscicapidae',
    rarity: 'uncommon',
    description: 'A skulking reed-bed songbird whose males flash a brilliant blue throat in spring.',
  },
  {
    id: 'white-tailed-eagle',
    commonName: 'White-tailed Eagle',
    scientificName: 'Haliaeetus albicilla',
    family: 'Accipitridae',
    rarity: 'rare',
    description: 'Europe’s largest eagle, with broad “barn door” wings and a short white tail.',
  },
  {
    id: 'greater-flamingo',
    commonName: 'Greater Flamingo',
    scientificName: 'Phoenicopterus roseus',
    family: 'Phoenicopteridae',
    rarity: 'uncommon',
    description: 'A pale pink flamingo that filters shrimp from salt pans and lagoons, often in large flocks.',
  },
  {
    id: 'european-bee-eater',
    commonName: 'European Bee-eater',
    scientificName: 'Merops apiaster',
    family: 'Meropidae',
    rarity: 'common',
    description: 'A rainbow-coloured aerial hunter that catches bees on the wing and nests in sandy banks.',
  },
];

export function findSpecies(id: string): Species | undefined {
  return species.find((candidate) => candidate.id === id);
}
