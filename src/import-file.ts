// In-app import of the RECIPE-IMPORT.md file format ("meal-prep-planner/1"): recipes and foods built anywhere
// (e.g. a claude.ai chat) as JSON. Each ingredient is matched to a USDA food (Sam's known names first, then the
// search), its unit turned into grams, and cans get their drained/whole switch. Foods become My foods entries.
// Nothing is saved here: the More → Import screen shows the review, lets Sam change matches, then saves.

import type { CustomFood, Nutrition, Recipe, RecipeItem } from './model';
import { newId, ZERO } from './model';
import { withDrainOptions } from './cans';
import { unitGrams, USDA_MATCH } from './import-recipes';
import { perPortion, portionsForProtein, times, totals } from './recipe-math';
import { search, type IndexedItem } from './search';
import type { Food } from './usda';

export const FORMAT = 'meal-prep-planner/1';

export interface FileIngredient {
  name: string;
  amount: number | null;
  unit: string;
  drained?: boolean;
  optional?: boolean;
}
export interface FileRecipe {
  name: string;
  kind: 'dish' | 'starch';
  servings?: number | null;
  main_ingredient?: string;
  ingredients: FileIngredient[];
  yield?: { amount: number; unit: string } | null;
  notes?: string | null;
  source?: string | null;
  /** Dishes: the side it's eaten with, by recipe name (e.g. "White rice"). Used by the recipe book. */
  serve_with?: string | null;
}
export interface FileFood {
  name: string;
  brand?: string | null;
  place?: string | null;
  serving?: string | null;
  serving_grams?: number | null;
  kcal: number;
  protein_g: number;
  carbs_g?: number | null;
  fat_g?: number | null;
  units?: { unit: string; grams: number }[];
}
export interface ImportFile {
  format: string;
  recipes: FileRecipe[];
  foods: FileFood[];
}

/** Read pasted text or a file: plain JSON, or JSON inside a ``` code block (as claude.ai replies). */
export function parseImportFile(text: string): ImportFile {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error("Couldn't find any JSON in that. Paste the whole reply, or pick the .json file.");
  let data: unknown;
  try {
    data = JSON.parse(body.slice(start, end + 1));
  } catch (e) {
    throw new Error(`The JSON has a typo in it (${(e as Error).message}). Ask claude.ai to send it again.`);
  }
  const d = data as Partial<ImportFile>;
  if (d.format && d.format !== FORMAT) throw new Error(`This is a "${d.format}" file; the app reads "${FORMAT}".`);
  const recipes = Array.isArray(d.recipes) ? d.recipes : [];
  const foods = Array.isArray(d.foods) ? d.foods : [];
  if (!recipes.length && !foods.length) throw new Error('No recipes or foods in that file.');
  recipes.forEach((r, i) => {
    if (!r?.name || !Array.isArray(r.ingredients)) throw new Error(`Recipe ${i + 1} needs a name and a list of ingredients.`);
  });
  foods.forEach((f, i) => {
    if (!f?.name || !Number.isFinite(Number(f.kcal))) throw new Error(`Food ${i + 1} needs a name and kcal.`);
  });
  return { format: FORMAT, recipes, foods };
}

// ---- Matching ingredients to USDA ----------------------------------------------------------------

/** Words that describe how something is bought or prepped, not what it is (left out when searching). */
const NOISE = /\b(fresh|chopped|diced|minced|sliced|shredded|large|small|medium|organic|boneless|skinless|lean|extra|about|optional)\b/g;

/** Ingredient name → USDA id Sam picked on an earlier import (kept in settings, so a fix is only made once). */
export type Learned = Record<string, number>;
export const learnKey = (name: string) => name.trim().toLowerCase();

/**
 * Best USDA foods for an ingredient name: what Sam picked before, his known names, then the search (dropping
 * words that match nothing).
 */
export function matchFoods(name: string, index: IndexedItem<Food>[], byId: Map<number, Food>, limit = 6, learned: Learned = {}): Food[] {
  if (!(learnKey(name) in learned) && USDA_MATCH[name] === null) return []; // known not to be in USDA
  const known = learned[learnKey(name)] ?? USDA_MATCH[name];
  const first = known ? byId.get(known) : undefined;
  let hits = search(index, name, limit);
  if (!hits.length) {
    const words = name.toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').replace(NOISE, ' ').split(/\s+/).filter(Boolean);
    const useful = words.filter((w) => search(index, w, 1).length > 0);
    // Drop words from the end until something matches ("Kidney beans canned low sodium" → "kidney beans canned").
    for (let n = useful.length; n > 0 && !hits.length; n--) hits = search(index, useful.slice(0, n).join(' '), limit);
  }
  return first ? [first, ...hits.filter((f) => f.id !== first.id)].slice(0, limit) : hits;
}

// ---- Building the review -------------------------------------------------------------------------

export interface ReviewLine {
  /** What the file said. */
  ing: FileIngredient;
  /** The item that will be saved (USDA-matched, or a note line). */
  item: RecipeItem;
  /** USDA name it was matched to, or "note only" / "no match". */
  matched: string;
  /** Other USDA foods it could be, for "change". */
  options: Food[];
  /** Something to check: a guessed size, no match... */
  warn?: string;
  /** Sam picked this match by hand. */
  changed?: boolean;
}

export interface ReviewRecipe {
  file: FileRecipe;
  lines: ReviewLine[];
}

/** Turn one file ingredient into a recipe item using a given USDA food (or none). */
export function itemFor(ing: FileIngredient, food: Food | undefined, allFoods: Food[]): Pick<ReviewLine, 'item' | 'matched' | 'warn'> {
  const base = { id: newId(), name: ing.name, amount: ing.amount, unit: ing.unit || 'g', scaling: 'scale' as const, optional: !!ing.optional };
  if (ing.amount === null || ing.amount === undefined || /to taste/i.test(ing.unit)) {
    return {
      item: { ...base, amount: null, unit: ing.unit || 'to taste', food: { kind: 'none' }, per100g: ZERO, gramsPerUnit: 0, scaling: 'fixed' },
      matched: 'note only (no calories)',
    };
  }
  if (!food) {
    const g = unitGrams(ing.unit);
    return {
      item: { ...base, food: { kind: 'none' }, per100g: ZERO, gramsPerUnit: g?.grams ?? 0 },
      matched: 'no match',
      warn: 'No USDA match: counts as 0 kcal. Tap “change” to pick one.',
    };
  }
  const size = unitGrams(ing.unit, food);
  let item: RecipeItem = { ...base, food: { kind: 'usda', id: food.id }, per100g: food.per100g, group: food.group, gramsPerUnit: size?.grams ?? 0 };
  item = withDrainOptions(item, allFoods, !!ing.drained);
  const warn = !size
    ? `USDA has no size for "${ing.unit}" for this food: counts as 0 kcal. Change the unit in Recipes after saving.`
    : size.note;
  const matched = item.drained && item.drain ? `${item.drain.drained.foodName} (drained, ~${item.gramsPerUnit} g per can)` : food.name;
  return { item, matched, warn };
}

export function reviewRecipe(
  r: FileRecipe,
  index: IndexedItem<Food>[],
  byId: Map<number, Food>,
  allFoods: Food[],
  learned: Learned = {},
  customs: CustomFood[] = [],
): ReviewRecipe {
  const lines = r.ingredients.map((ing): ReviewLine => {
    const custom = ing.amount === null ? undefined : customs.find((c) => sameName(c.name, ing.name));
    const options = ing.amount === null ? [] : matchFoods(ing.name, index, byId, 6, learned);
    if (custom && !(learnKey(ing.name) in learned)) return { ing, options, ...itemForCustom(ing, custom) };
    const line = { ing, options, ...itemFor(ing, options[0], allFoods) };
    if (!options.length && ing.amount !== null && USDA_MATCH[ing.name] === null) {
      line.warn = 'Not in USDA: add it to My foods (e.g. from its label), then import again. Counts as 0 kcal for now.';
    }
    return line;
  });
  return { file: r, lines };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** An ingredient made from a My foods entry (e.g. chipotle peppers in adobo, from its label). */
export function itemForCustom(ing: FileIngredient, c: CustomFood): Pick<ReviewLine, 'item' | 'matched' | 'warn'> {
  const serving = c.servingGrams && c.servingGrams > 0 ? c.servingGrams : undefined;
  const g = serving ?? 100; // no weight known: count the amount in servings
  const per100g = times(c.perServing, 100 / g);
  const servingWord = c.servingLabel.replace(/^1\s+/, '').trim().toLowerCase();
  const u = ing.unit.trim();
  const extra = (c.units ?? []).find((x) => sameName(x.unit, u) || sameName(`${x.unit}s`, u));
  const grams = unitGrams(u)?.grams ?? (extra ? extra.grams : sameName(u, servingWord) || /^servings?$/i.test(u) || !serving ? g : undefined);
  const item: RecipeItem = {
    id: newId(), name: ing.name, amount: ing.amount, unit: u, scaling: 'scale', optional: !!ing.optional,
    food: { kind: 'custom', id: c.id }, per100g, group: c.group, gramsPerUnit: grams ?? 0,
  };
  return {
    item,
    matched: `My foods: ${c.name} (${Math.round(c.perServing.kcal)} kcal per ${c.servingLabel})`,
    warn: grams === undefined ? `No weight for "${u}" of this My foods entry: counts as 0 kcal. Give it a serving weight.` : undefined,
  };
}

/** The same line matched to a different USDA food (keeps the amount and unit). */
export function rematch(line: ReviewLine, food: Food, allFoods: Food[]): ReviewLine {
  return { ...line, changed: true, options: [food, ...line.options.filter((f) => f.id !== food.id)], ...itemFor(line.ing, food, allFoods) };
}

/** The recipe as it will be saved. `keepId` replaces an existing recipe (its batches and meals stay linked). */
export function toRecipe(rv: ReviewRecipe, now: string, keepId?: { id: string; createdAt: string }): Recipe {
  const r = rv.file;
  const items = rv.lines.map((l) => l.item);
  const main = rv.lines.find((l) => l.ing.name === r.main_ingredient && l.item.amount !== null) ?? rv.lines.find((l) => l.item.amount !== null);
  const notes = [
    r.notes,
    r.source ? `Source: ${r.source}` : '',
  ].filter(Boolean).join('\n');
  return {
    id: keepId?.id ?? newId(),
    name: r.name.trim(),
    kind: r.kind === 'starch' ? 'starch' : 'dish',
    items,
    mainItemId: main?.item.id,
    ...(r.kind !== 'starch' && r.servings && r.servings > 0 ? { servings: Math.round(r.servings) } : {}),
    ...(r.kind !== 'starch' && r.serve_with?.trim() ? { serveWith: r.serve_with.trim() } : {}),
    ...(r.kind === 'starch'
      ? { yieldAmount: r.yield?.amount ?? 1, yieldUnit: r.yield?.unit ?? 'cup cooked' }
      : {}),
    notes: notes || undefined,
    createdAt: keepId?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Batch totals and what one container comes to (the recipe's container count, else the protein target). */
export function recipePreview(rv: ReviewRecipe, proteinPerMeal: number): { total: Nutrition; containers?: number; each?: Nutrition } {
  const total = totals(rv.lines.map((l) => l.item));
  if (rv.file.kind === 'starch') return { total };
  const containers = rv.file.servings && rv.file.servings > 0 ? Math.round(rv.file.servings) : portionsForProtein(total, proteinPerMeal);
  return { total, containers, each: perPortion(total, containers) };
}

export function toCustomFood(f: FileFood, keepId?: string): CustomFood {
  const units = (f.units ?? []).filter((u) => u?.unit && u.grams > 0).map((u) => ({ unit: String(u.unit).trim(), grams: Number(u.grams) }));
  return {
    id: keepId ?? newId(),
    name: f.name.trim(),
    ...(f.place ? { place: f.place } : {}),
    ...(f.brand ? { brand: f.brand } : {}),
    servingLabel: f.serving?.trim() || '1 serving',
    ...(f.serving_grams ? { servingGrams: Number(f.serving_grams) } : {}),
    perServing: { kcal: Number(f.kcal) || 0, protein: Number(f.protein_g) || 0, carbs: Number(f.carbs_g) || 0, fat: Number(f.fat_g) || 0 },
    ...(units.length ? { units } : {}),
  };
}

/** Same food already in My foods? Same name, and same place if it has one. */
export function sameFood(a: Pick<CustomFood, 'name' | 'place'>, b: Pick<CustomFood, 'name' | 'place'>) {
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && (a.place ?? '').toLowerCase() === (b.place ?? '').toLowerCase();
}

/** Matches Sam changed by hand in this review, to remember for next time. */
export function learnedFrom(recipes: ReviewRecipe[]): Learned {
  const out: Learned = {};
  for (const r of recipes) {
    for (const l of r.lines) {
      if (l.changed && l.item.food.kind === 'usda') out[learnKey(l.ing.name)] = l.item.food.id;
    }
  }
  return out;
}
