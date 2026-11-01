// The 14 allergens UK food law requires businesses to declare.
export const ALLERGENS = [
  'celery',
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'lupin',
  'milk',
  'molluscs',
  'mustard',
  'peanuts',
  'sesame',
  'soya',
  'sulphites',
  'tree-nuts',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  celery: 'Celery',
  gluten: 'Cereals containing gluten',
  crustaceans: 'Crustaceans',
  eggs: 'Eggs',
  fish: 'Fish',
  lupin: 'Lupin',
  milk: 'Milk',
  molluscs: 'Molluscs',
  mustard: 'Mustard',
  peanuts: 'Peanuts',
  sesame: 'Sesame',
  soya: 'Soya',
  sulphites: 'Sulphur dioxide and sulphites',
  'tree-nuts': 'Tree nuts',
};

// A plant-based item can never *contain* these. They are still allowed in
// `mayContain` for shared-kitchen cross-contamination warnings.
export const ANIMAL_DERIVED: readonly Allergen[] = ['crustaceans', 'eggs', 'fish', 'milk', 'molluscs'];

export const DIETARY = ['gluten-free', 'nut-free', 'soya-free', 'refined-sugar-free'] as const;
export type Dietary = (typeof DIETARY)[number];

export const DIETARY_LABELS: Record<Dietary, string> = {
  'gluten-free': 'Gluten free',
  'nut-free': 'Nut free',
  'soya-free': 'Soya free',
  'refined-sugar-free': 'Refined sugar free',
};

// Menu page sections appear in this order.
export const CATEGORIES = ['cakes', 'cupcakes', 'cookies', 'brownies-and-bars', 'breads', 'pastries'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  cakes: 'Cakes',
  cupcakes: 'Cupcakes',
  cookies: 'Cookies',
  'brownies-and-bars': 'Brownies and bars',
  breads: 'Breads',
  pastries: 'Pastries',
};
