// Calendar and shopping maths: dates, day/week totals, portions left in a batch, and the grocery list.

import type { Batch, CalendarEntry, Nutrition, RecipeItem } from './model';
import { foodKey, ZERO } from './model';
import { add, itemGrams } from './recipe-math';
import { fmtAmount, fmtWeight, stepFor } from './units';

// ---- Dates (local, as YYYY-MM-DD strings) ---------------------------------------------------------

export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** Monday of the week containing `s`. */
export function weekStart(s: string): string {
  const d = parseDate(s);
  const back = (d.getDay() + 6) % 7;
  return addDays(s, -back);
}

export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

export function dayLabel(s: string): string {
  return parseDate(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ---- Totals --------------------------------------------------------------------------------------

export const sumEntries = (entries: CalendarEntry[]): Nutrition =>
  entries.reduce((t, e) => add(t, e.nutrition), ZERO);

/** Average per day over the days that have anything planned or logged (empty days don't drag it down). */
export function weekAverage(entries: CalendarEntry[]): { perDay: Nutrition; days: number } {
  const days = new Set(entries.map((e) => e.date)).size;
  const t = sumEntries(entries);
  const k = days ? 1 / days : 0;
  return { perDay: { kcal: t.kcal * k, protein: t.protein * k, carbs: t.carbs * k, fat: t.fat * k }, days };
}

/** Portions of a batch already put on the calendar. */
export function portionsUsed(batchId: string, entries: CalendarEntry[]): number {
  return entries.reduce((n, e) => (e.source.kind === 'batch' && e.source.batchId === batchId ? n + e.source.portions : n), 0);
}

// ---- Grocery list --------------------------------------------------------------------------------

export const AISLES = [
  'Produce',
  'Meat & seafood',
  'Dairy & eggs',
  'Canned & jarred',
  'Grains, pasta & bread',
  'Frozen',
  'Spices & baking',
  'Oils & sauces',
  'Other',
] as const;
export type Aisle = (typeof AISLES)[number];

export function aisleFor(item: Pick<RecipeItem, 'name' | 'group' | 'unit'>): Aisle {
  const n = item.name.toLowerCase();
  const g = item.group ?? '';
  if (/\bfrozen\b/.test(n)) return 'Frozen';
  if (/\bcanned\b|\bcan\b/.test(n) || /^can\b/.test(item.unit)) return 'Canned & jarred';
  if (/Vegetable|Fruit/.test(g)) return 'Produce';
  if (/Beef|Pork|Poultry|Lamb|Sausage|Finfish/.test(g)) return 'Meat & seafood';
  if (/Dairy/.test(g)) return 'Dairy & eggs';
  if (/Legume|Soup/.test(g)) return 'Canned & jarred';
  if (/Cereal|Baked|Breakfast/.test(g)) return 'Grains, pasta & bread';
  if (/Spice|Sweets/.test(g)) return 'Spices & baking';
  if (/Fats|Oil/.test(g)) return 'Oils & sauces';
  return 'Other';
}

export interface GroceryLine {
  key: string;
  name: string;
  aisle: Aisle;
  /** "3 cans (15 oz)", "6.15 lb", "1¼ cup" */
  amountText: string;
  grams: number;
  /** Which batches need it, for "why is this on the list". */
  forRecipes: string[];
  staple: boolean;
}

/**
 * One combined list for the given batches. Same food + same unit adds up in that unit (cans round up to whole
 * cans); mixed units add up by weight.
 */
export function groceryList(batches: Batch[], staples: string[] = []): GroceryLine[] {
  const lines = new Map<string, { items: RecipeItem[]; recipes: Set<string> }>();
  for (const b of batches) {
    for (const i of b.items) {
      if (i.amount === null || i.optional) continue;
      const key = foodKey(i.food, i.name);
      const l = lines.get(key) ?? lines.set(key, { items: [], recipes: new Set() }).get(key)!;
      l.items.push(i);
      l.recipes.add(b.recipeName);
    }
  }
  const out: GroceryLine[] = [];
  for (const [key, { items, recipes }] of lines) {
    const grams = items.reduce((g, i) => g + itemGrams(i), 0);
    const units = new Set(items.map((i) => i.unit));
    let amountText: string;
    if (units.size === 1) {
      const unit = items[0].unit;
      let amount = items.reduce((a, i) => a + (i.amount ?? 0), 0);
      const step = stepFor(unit);
      if (step) amount = Math.ceil(amount / step - 1e-9) * step;
      amountText = step || unit === 'g' ? `${fmtAmount(amount)} ${unit}` : fmtWeight(grams);
    } else {
      amountText = fmtWeight(grams);
    }
    out.push({
      key,
      name: items[0].name,
      aisle: aisleFor(items[0]),
      amountText,
      grams,
      forRecipes: [...recipes],
      staple: staples.includes(key),
    });
  }
  return out.sort((a, b) => AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) || a.name.localeCompare(b.name));
}
