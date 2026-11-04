// The prep sheet for one cook day: what to cook, how much of everything, and how to divide it. For each dish
// cooked that day: the containers its planned meals need, grouped by what goes in them (servings and cups of
// rice), grams of the dish per container once the pot is weighed, numbers per container, which days each is for,
// fridge or freezer, and spare. Then the starch (rice) to cook for all of them. Worked out from the plan; nothing
// is stored here.

import type { Batch, Nutrition, Recipe } from './model';
import type { Coverage } from './cookdays';
import { dishNutrition, entryPortions } from './cookdays';
import { batchSummary, starchToCook } from './recipe-math';

export interface PrepGroup {
  /** Servings of the dish in each of these containers (usually 1). */
  portions: number;
  starch?: Recipe;
  /** Cups (yield units) of starch in each container. */
  cups: number;
  count: number;
  /** One container of this kind. */
  each: Nutrition;
  /** Grams of the dish in one container, once the cooked weight is known. */
  grams?: number;
  /** Day each container is for, in order; with whether it goes in the freezer. */
  meals: { date: string; frozen: boolean }[];
}

export interface PrepDish {
  batch: Batch;
  recipe?: Recipe;
  /** One plain serving of the dish. */
  each: Nutrition;
  gramsEach?: number;
  groups: PrepGroup[];
  spare: number;
  short: number;
  fridge: number;
  freezer: number;
}

export interface PrepStarch {
  recipe: Recipe;
  /** Cooked cups (yield units) needed in all. */
  cups: number;
  containers: number;
  /** What to cook: the starch recipe scaled to `cups`. */
  cook: ReturnType<typeof starchToCook>;
}

export interface PrepSheet {
  date: string;
  dishes: PrepDish[];
  starches: PrepStarch[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function prepSheet(date: string, batches: Batch[], recipes: Recipe[], cov: Coverage): PrepSheet {
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const starchCups = new Map<string, { cups: number; containers: number }>();
  const dishes: PrepDish[] = [];

  for (const b of batches.filter((x) => x.cookDate === date)) {
    const recipe = recipeById.get(b.recipeId);
    if (recipe?.kind === 'starch') continue;
    const s = batchSummary(b);
    const day = cov.cookDays.get(b.id);
    const meals = (day?.entries ?? []).filter((e) => !e.eaten && !cov.short.has(e.id));
    const groups = new Map<string, PrepGroup>();
    for (const e of meals) {
      if (e.source.kind !== 'dish' && e.source.kind !== 'batch') continue;
      const portions = entryPortions(e);
      const st = e.source.starch;
      const starch = st ? recipeById.get(st.recipeId) : undefined;
      const cups = starch && st ? r2(st.cups * portions) : 0;
      const key = `${portions}|${starch?.id ?? ''}|${cups}`;
      const g = groups.get(key) ?? groups.set(key, {
        portions, starch, cups, count: 0, meals: [],
        each: dishNutrition(s.each, portions, starch, starch && portions ? cups / portions : 0),
        grams: s.gramsEach ? s.gramsEach * portions : undefined,
      }).get(key)!;
      g.count++;
      g.meals.push({ date: e.date, frozen: cov.frozen.has(e.id) });
      if (starch && cups) {
        const t = starchCups.get(starch.id) ?? { cups: 0, containers: 0 };
        starchCups.set(starch.id, { cups: t.cups + cups, containers: t.containers + 1 });
      }
    }
    const list = [...groups.values()].sort((a, b) => a.meals[0].date.localeCompare(b.meals[0].date));
    const freezer = list.reduce((n, g) => n + g.meals.filter((m) => m.frozen).length, 0);
    dishes.push({
      batch: b, recipe, each: s.each, gramsEach: s.gramsEach, groups: list,
      spare: r2(day?.spare ?? b.portions), short: r2(day?.short ?? 0),
      fridge: meals.length - freezer, freezer,
    });
  }

  const starches = [...starchCups].flatMap(([id, t]) => {
    const recipe = recipeById.get(id);
    return recipe ? [{ recipe, cups: r2(t.cups), containers: t.containers, cook: starchToCook(recipe, t.cups) }] : [];
  });
  return { date, dishes, starches };
}

/** Cook days to offer on the prep sheet: the next one on or after `today` first, then the rest by date. */
export function prepDates(batches: Batch[], today: string): string[] {
  const dates = [...new Set(batches.filter((b) => b.status === 'planned' || b.cookDate >= today).map((b) => b.cookDate))].sort();
  const next = dates.findIndex((d) => d >= today);
  if (next === -1) return dates.reverse(); // all past: the latest first
  return [...dates.slice(next), ...dates.slice(0, next).reverse()];
}
