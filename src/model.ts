// The app's data model. Everything here is stored on the phone (IndexedDB, see db.ts) and goes into the
// backup file as-is, so keep it plain data and documented. Weights are grams, energy is kcal.
//
//   Food (USDA, read-only, usda.ts)   CustomFood ("My foods": takeout, treats, things USDA lacks)
//            \                        /
//             RecipeItem (food + amount in a normal unit) ── inside ── Recipe (template: a dish or a starch)
//                                                                         │
//                                                Batch (one cook of a recipe: planned or cooked, real amounts,
//                                                       portions, cooked weight, fridge/freezer counts)
//                                                                         │
//                                  CalendarEntry (a slot on a day: a batch portion (+ starch), or any food;
//                                                 keeps its own copy of the nutrition so history never changes)

export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const ZERO: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Where an ingredient's nutrition came from. */
export type FoodRef = { kind: 'usda'; id: number } | { kind: 'custom'; id: string } | { kind: 'none' };

export interface RecipeItem {
  id: string;
  name: string;
  food: FoodRef;
  /** Copy of the food's nutrition per 100 g, so the recipe works even if the food changes. */
  per100g: Nutrition;
  /** USDA food group, used to sort the grocery list into aisles. */
  group?: string;
  /** Amount in the unit below; null for "to taste" lines (no nutrition). */
  amount: number | null;
  /** Unit as Sam thinks of it: "lb", "oz", "cup", "medium", "can (15 oz)"... */
  unit: string;
  gramsPerUnit: number;
  /**
   * How the item behaves when the batch is scaled to the main ingredient's weight:
   * 'scale' = proportional (rounded to the unit's step), 'fixed' = same amount every time.
   */
  scaling: 'scale' | 'fixed';
  /** Optional add-ons (e.g. cheddar on chili) are listed but not counted in the batch totals. */
  optional?: boolean;
  /** Canned goods: the whole-can and drained versions (see cans.ts); `drained` says which one is in use. */
  drain?: { whole: ItemVariant; drained: ItemVariant };
  drained?: boolean;
}

/** One version of an ingredient (e.g. a can of beans drained), swapped in by a toggle. */
export interface ItemVariant {
  food: FoodRef;
  foodName?: string;
  per100g: Nutrition;
  gramsPerUnit: number;
}

/** A pot or container with its empty weight, for "weigh the pot". */
export interface Pot {
  id: string;
  name: string;
  grams: number;
}

export interface Recipe {
  id: string;
  name: string;
  /** 'dish' = protein dish split into containers; 'starch' = rice/pasta/potatoes measured per cooked cup. */
  kind: 'dish' | 'starch';
  items: RecipeItem[];
  /** The item whose weight sets the batch size (usually the protein). */
  mainItemId?: string;
  /** For starches: what the base amounts make, e.g. 12 (cups cooked). */
  yieldAmount?: number;
  yieldUnit?: string; // e.g. "cup cooked"
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  id: string;
  recipeId: string;
  recipeName: string;
  status: 'planned' | 'cooked';
  /** Day it is (or was) cooked, YYYY-MM-DD. */
  cookDate: string;
  /** The amounts actually used (a scaled copy of the recipe's items). */
  items: RecipeItem[];
  portions: number;
  /** Cooked weight of the food, without the pot, in grams (optional). */
  cookedWeightG?: number;
  /** Containers on hand. */
  fridge: number;
  freezer: number;
  notes?: string;
  createdAt: string;
}

export interface CustomFood {
  id: string;
  name: string;
  /** e.g. "Chipotle" for takeout; empty for pantry items. */
  place?: string;
  /** Nutrition for one serving as described by servingLabel. */
  perServing: Nutrition;
  servingLabel: string; // e.g. "1 bowl", "1 can (7 oz)"
  /** Weight of one serving if known; lets it be used as a recipe ingredient by weight. */
  servingGrams?: number;
  group?: string;
}

export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface CalendarEntry {
  id: string;
  date: string; // YYYY-MM-DD
  slot: Slot;
  /** What it is, for display: "Sweet Potato Beef Chili + 1⅓ cup rice". */
  label: string;
  source:
    | { kind: 'batch'; batchId: string; portions: number; starch?: { batchId?: string; recipeId: string; cups: number } }
    | { kind: 'food'; food: FoodRef; amount: number; unit: string }
    | { kind: 'quick' };
  /** Nutrition copied in when the entry is made, so the log never changes afterwards. */
  nutrition: Nutrition;
  /** Planned until ticked as eaten. */
  eaten: boolean;
}

export interface Settings {
  id: 'settings';
  proteinPerMeal: number; // g, e.g. 40
  mealKcalMin: number; // 600
  mealKcalMax: number; // 900
  /** What a container aims for when the app suggests a starch amount. */
  mealKcalAim: number; // 700
  dayKcalMin: number; // 2000
  dayKcalMax: number; // 3000
  /** USDA ids / custom ids of things always in the pantry; hidden from grocery lists. */
  pantryStaples: string[];
  /** Saved pots/containers and their empty weights; the last one used is picked first next time. */
  pots: Pot[];
  lastPotId?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  proteinPerMeal: 40,
  mealKcalMin: 600,
  mealKcalMax: 900,
  mealKcalAim: 700,
  dayKcalMin: 2000,
  dayKcalMax: 3000,
  pantryStaples: [],
  pots: [],
};

/** Grocery list tick marks, per list (keyed by its date range). */
export interface GroceryChecks {
  id: string; // "2026-11-01..2026-11-30"
  checked: string[]; // item keys
}

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 16);

export const foodKey = (f: FoodRef, name: string) =>
  f.kind === 'usda' ? `usda:${f.id}` : f.kind === 'custom' ? `custom:${f.id}` : `name:${name.toLowerCase()}`;
