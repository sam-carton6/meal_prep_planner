// All the recipe maths: totals, scaling to the protein you bought, portions, weight per container,
// and how much starch to add to a container.

import type { Batch, Nutrition, Recipe, RecipeItem } from './model';
import { ZERO } from './model';
import { roundToStep, stepFor } from './units';

export const add = (a: Nutrition, b: Nutrition): Nutrition => ({
  kcal: a.kcal + b.kcal,
  protein: a.protein + b.protein,
  carbs: a.carbs + b.carbs,
  fat: a.fat + b.fat,
});

export const times = (a: Nutrition, k: number): Nutrition => ({
  kcal: a.kcal * k,
  protein: a.protein * k,
  carbs: a.carbs * k,
  fat: a.fat * k,
});

export const itemGrams = (i: RecipeItem) => (i.amount ?? 0) * i.gramsPerUnit;

export const itemNutrition = (i: RecipeItem): Nutrition => times(i.per100g, itemGrams(i) / 100);

/** Batch totals; optional add-ons are left out. */
export function totals(items: RecipeItem[]): Nutrition {
  return items.filter((i) => !i.optional).reduce((sum, i) => add(sum, itemNutrition(i)), ZERO);
}

export const mainItem = (r: Pick<Recipe, 'items' | 'mainItemId'>) => r.items.find((i) => i.id === r.mainItemId);

/**
 * Scale a recipe so its main ingredient weighs `mainGrams` (what you actually bought).
 * Everything marked 'scale' follows proportionally, then rounds to its unit's step (whole cans, ¼ cups);
 * 'fixed' items stay as written. The main item keeps the exact weight entered.
 */
export function scaleItems(recipe: Pick<Recipe, 'items' | 'mainItemId'>, mainGrams: number): RecipeItem[] {
  const main = mainItem(recipe);
  const baseGrams = main ? itemGrams(main) : 0;
  const factor = baseGrams > 0 ? mainGrams / baseGrams : 1;
  return recipe.items.map((i) => {
    if (i.amount === null) return { ...i };
    if (main && i.id === main.id) return { ...i, amount: mainGrams / i.gramsPerUnit };
    if (i.scaling === 'fixed') return { ...i };
    return { ...i, amount: roundToStep(i.amount * factor, stepFor(i.unit)) };
  });
}

/** Number of containers that gives about `proteinPerMeal` g protein each (at least 1). */
export function portionsForProtein(total: Nutrition, proteinPerMeal: number): number {
  if (proteinPerMeal <= 0) return 1;
  return Math.max(1, Math.round(total.protein / proteinPerMeal));
}

export const perPortion = (total: Nutrition, portions: number): Nutrition => times(total, 1 / Math.max(1, portions));

export const gramsPerPortion = (cookedWeightG: number | undefined, portions: number) =>
  cookedWeightG && portions > 0 ? cookedWeightG / portions : undefined;

// ---- Starches -----------------------------------------------------------------------------------

/** Nutrition of one yield unit (e.g. one cup cooked) of a starch recipe. */
export function perYieldUnit(starch: Pick<Recipe, 'items' | 'yieldAmount'>): Nutrition {
  return times(totals(starch.items), 1 / Math.max(1e-9, starch.yieldAmount ?? 1));
}

/**
 * Cups (yield units) of starch to bring a container from `dishKcal` up to `aimKcal`, in quarter steps.
 * Zero if the dish already reaches the aim.
 */
export function starchToReach(dishKcal: number, aimKcal: number, starchKcalPerUnit: number): number {
  if (starchKcalPerUnit <= 0 || dishKcal >= aimKcal) return 0;
  return Math.round(((aimKcal - dishKcal) / starchKcalPerUnit) * 4) / 4;
}

/**
 * How much to cook to get `wantedYield` (e.g. cups cooked): the starch recipe's items scaled down/up.
 * "2 frozen containers × 1⅓ cups cooked rice" → about 0.9 cup dry rice.
 */
export function starchToCook(starch: Pick<Recipe, 'items' | 'yieldAmount'>, wantedYield: number): RecipeItem[] {
  const k = wantedYield / Math.max(1e-9, starch.yieldAmount ?? 1);
  return starch.items.map((i) => (i.amount === null ? { ...i } : { ...i, amount: i.amount * k }));
}

// ---- Batches ------------------------------------------------------------------------------------

export function batchSummary(b: Pick<Batch, 'items' | 'portions' | 'cookedWeightG'>) {
  const total = totals(b.items);
  return {
    total,
    each: perPortion(total, b.portions),
    gramsEach: gramsPerPortion(b.cookedWeightG, b.portions),
  };
}
