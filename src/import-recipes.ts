// One-time import of Sam's recipes.json: matches each ingredient to a USDA food, recalculates from USDA, and
// reports old vs new numbers side by side so Sam can check before saving.

import type { Batch, CustomFood, Nutrition, Recipe, RecipeItem } from './model';
import { newId } from './model';
import { totals } from './recipe-math';
import { gramsFromLabel, G_PER, unitOptions } from './units';
import type { Food } from './usda';
import { withDrainOptions } from './cans';

interface OldIngredient {
  name: string;
  amount: number | null;
  unit: string;
  calories: number;
  protein_g: number;
}
interface OldRecipe {
  id: string;
  name: string;
  logged: string;
  portions: number;
  serve_with?: string;
  notes?: string;
  ingredients: OldIngredient[];
  optional?: OldIngredient[];
  totals: { calories: number; protein_g: number };
  cooked_weight_g?: number;
}
interface OldSide {
  id: string;
  name: string;
  batch: { amount: number; unit: string; calories: number; protein_g: number; yield_cups_cooked: number };
}
export interface OldFile {
  recipes: OldRecipe[];
  sides: OldSide[];
}

/**
 * Which USDA food each ingredient name means (picked 20 Oct 2026; see TODO.md for the ones worth a second look).
 * null = not in USDA: becomes a "My foods" entry using Sam's own numbers.
 */
export const USDA_MATCH: Record<string, number | null> = {
  'Chicken thighs, boneless skinless, raw': 173627, // SR Legacy 121 kcal/100 g (Foundation 2646171 says 149)
  'Black beans, canned': 175188,
  'Chipotle peppers in adobo': null,
  Carrots: 170393,
  Peas: 170016, // frozen
  'Diced tomatoes, canned': 170051,
  'White onion': 170000,
  'Bell peppers': 170108, // red
  Spinach: 168462,
  'Chicken broth': 174566,
  Garlic: 1104647,
  'Ground beef 85/15, raw': 171796,
  'Sweet potatoes, orange': 168482,
  'Dark red kidney beans, canned': 175245, // solids and liquid, to match a whole can's weight
  'Great northern beans, canned': 175192,
  'Crushed tomatoes, canned': 2685581,
  'Sweet onion': 170008,
  'Shredded cheddar': 328637,
  'White rice, long grain': 168877, // dry
};

/** Cans Sam drained in his old recipes (he usually drains, but used whole cans in the chili; 21 Oct 2026). */
const DRAINED_IN_OLD = new Set(['mexican-chicken-vegetables:Black beans, canned']);

export interface ImportLine {
  name: string;
  matched: string; // USDA name or "My foods" / "note"
  amountText: string;
  old: { kcal: number; protein: number };
  now: { kcal: number; protein: number };
  /** How the grams were worked out, when it's a guess. */
  note?: string;
}

export interface ImportResult {
  recipes: Recipe[];
  batches: Batch[];
  customFoods: CustomFood[];
  report: { name: string; old: { kcal: number; protein: number }; now: Nutrition; lines: ImportLine[] }[];
}

const UNIT_WORDS: Record<string, string[]> = { whole: ['medium', 'whole'], medium: ['medium'], head: ['head'] };

function toItem(ing: OldIngredient, foods: Map<number, Food>, customFoods: CustomFood[], optional = false, drained = false) {
  const base = { id: newId(), name: ing.name, amount: ing.amount, unit: ing.unit, scaling: 'scale' as const, optional };
  const old = { kcal: ing.calories, protein: ing.protein_g };

  if (ing.amount === null) {
    const item: RecipeItem = { ...base, food: { kind: 'none' }, per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      gramsPerUnit: 0, scaling: 'fixed' };
    return { item, line: { name: ing.name, matched: 'note only', amountText: ing.unit, old, now: { kcal: 0, protein: 0 } } };
  }

  const usdaId = USDA_MATCH[ing.name];
  const food = usdaId ? foods.get(usdaId) : undefined;
  let note: string | undefined;

  // Weight of one unit: plain weights, "(15 oz)" labels, cups and portions from USDA, else back-calculated
  // from Sam's own calories for that line (marked as a guess).
  const weightOf = (per100kcal: number): number => {
    const u = ing.unit;
    if (u in G_PER) return G_PER[u as keyof typeof G_PER];
    const fromLabel = gramsFromLabel(u);
    if (fromLabel) return fromLabel;
    if (food) {
      const opts = unitOptions(food.portions);
      for (const w of UNIT_WORDS[u] ?? [u]) {
        const hit = opts.find((o) => o.unit === w || o.unit.startsWith(w + ' ') || o.unit.startsWith(w + ','));
        if (hit) {
          if (w !== u) note = `1 ${u} taken as USDA "${hit.unit}" (${Math.round(hit.gramsPerUnit)} g)`;
          return hit.gramsPerUnit;
        }
      }
    }
    const g = per100kcal > 0 ? ing.calories / (per100kcal / 100) / (ing.amount ?? 1) : 0;
    note = `no USDA size for "${u}": ${Math.round(g)} g each, worked out from your old calories`;
    return g;
  };

  let item: RecipeItem;
  let matched: string;
  if (food) {
    item = { ...base, food: { kind: 'usda', id: food.id }, per100g: food.per100g, group: food.group, gramsPerUnit: 0 };
    item.gramsPerUnit = weightOf(food.per100g.kcal);
    item = withDrainOptions(item, [...foods.values()], drained);
    matched = item.drained ? `${item.drain!.drained.foodName} (drained, ~${item.gramsPerUnit} g per can)` : food.name;
  } else {
    // Not in USDA: keep Sam's numbers as a "My foods" entry.
    const gramsPerUnit = gramsFromLabel(ing.unit) ?? 100;
    const servings = ing.amount;
    const cf: CustomFood = {
      id: newId(),
      name: ing.name,
      servingLabel: `1 ${ing.unit}`,
      servingGrams: gramsPerUnit,
      perServing: { kcal: ing.calories / servings, protein: ing.protein_g / servings, carbs: 0, fat: 0 },
    };
    customFoods.push(cf);
    const k = 100 / gramsPerUnit;
    item = { ...base, food: { kind: 'custom', id: cf.id }, gramsPerUnit,
      per100g: { kcal: cf.perServing.kcal * k, protein: cf.perServing.protein * k, carbs: 0, fat: 0 } };
    matched = 'My foods (not in USDA; your numbers)';
  }
  const t = totals([{ ...item, optional: false }]);
  return {
    item,
    line: { name: ing.name, matched, amountText: `${ing.amount} ${ing.unit}`, old, now: { kcal: t.kcal, protein: t.protein }, note },
  };
}

export function buildImport(file: OldFile, foodList: Food[], now = new Date().toISOString()): ImportResult {
  const foods = new Map(foodList.map((f) => [f.id, f]));
  const out: ImportResult = { recipes: [], batches: [], customFoods: [], report: [] };

  for (const r of file.recipes) {
    const lines: ImportLine[] = [];
    const items: RecipeItem[] = [];
    for (const ing of r.ingredients) {
      const { item, line } = toItem(ing, foods, out.customFoods, false, DRAINED_IN_OLD.has(`${r.id}:${ing.name}`));
      items.push(item);
      lines.push(line);
    }
    for (const ing of r.optional ?? []) {
      const { item, line } = toItem(ing, foods, out.customFoods, true);
      items.push(item);
      lines.push({ ...line, name: `${line.name} (optional, not in totals)` });
    }
    const recipe: Recipe = {
      id: newId(),
      name: r.name,
      kind: 'dish',
      items,
      mainItemId: items[0]?.id, // the protein comes first in Sam's list
      notes: [r.notes, r.serve_with ? `Serve with: ${r.serve_with}` : ''].filter(Boolean).join('\n') || undefined,
      createdAt: now,
      updatedAt: now,
    };
    out.recipes.push(recipe);
    out.batches.push({
      id: newId(),
      recipeId: recipe.id,
      recipeName: r.name,
      status: 'cooked',
      cookDate: r.logged,
      items: items.map((i) => ({ ...i })),
      portions: r.portions,
      cookedWeightG: r.cooked_weight_g,
      fridge: 0,
      freezer: 0,
      createdAt: now,
    });
    out.report.push({ name: r.name, old: { kcal: r.totals.calories, protein: r.totals.protein_g }, now: totals(items), lines });
  }

  for (const s of file.sides) {
    const ing: OldIngredient = { name: s.name, amount: s.batch.amount, unit: s.batch.unit.replace(/ dry$/, ''),
      calories: s.batch.calories, protein_g: s.batch.protein_g };
    const { item, line } = toItem(ing, foods, out.customFoods);
    out.recipes.push({
      id: newId(),
      name: s.name,
      kind: 'starch',
      items: [{ ...item, name: /dry/.test(s.batch.unit) ? `${item.name} (dry)` : item.name }],
      mainItemId: item.id,
      yieldAmount: s.batch.yield_cups_cooked,
      yieldUnit: 'cup cooked',
      notes: `${s.batch.amount} ${s.batch.unit} makes ${s.batch.yield_cups_cooked} cups cooked`,
      createdAt: now,
      updatedAt: now,
    });
    out.report.push({ name: `${s.name} (starch)`, old: { kcal: s.batch.calories, protein: s.batch.protein_g },
      now: totals([item]), lines: [{ ...line, amountText: `${s.batch.amount} ${s.batch.unit}` }] });
  }
  return out;
}
