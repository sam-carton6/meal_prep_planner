// The pantry: things Sam keeps on hand (sauces, spices, rice, oats, beans...). They stay off the main shopping
// list; the Shop tab lists the ones this week's cooking uses ("check you have enough"), and anything marked
// running low goes under Restock. Stored in settings (no database change); older `pantryStaples` keys still count.

import type { PantryItem, Recipe, Settings } from './model';
import { foodKey } from './model';
import { aisleFor } from './plan';

/** Food keys that are in the pantry (hidden from the main list). */
export function pantryKeys(s: Pick<Settings, 'pantry' | 'pantryStaples'>): string[] {
  return [...new Set([...(s.pantryStaples ?? []), ...(s.pantry ?? []).flatMap((p) => (p.key ? [p.key] : []))])];
}

const clean = (name: string) => name.trim().replace(/\s+/g, ' ');

/** Add an item (by name, optionally tied to a food key); an existing one with the same key or name is kept. */
export function addPantry(list: PantryItem[], name: string, id: string, key?: string): PantryItem[] {
  const n = clean(name);
  if (!n) return list;
  if (list.some((p) => (key && p.key === key) || p.name.toLowerCase() === n.toLowerCase())) return list;
  return [...list, { id, name: n, ...(key ? { key } : {}) }].sort((a, b) => a.name.localeCompare(b.name));
}

/** Take an item out of the pantry; also drops its key from the older staples list. */
export function removePantry(s: Pick<Settings, 'pantry' | 'pantryStaples'>, id: string) {
  const item = (s.pantry ?? []).find((p) => p.id === id);
  return {
    pantry: (s.pantry ?? []).filter((p) => p.id !== id),
    pantryStaples: (s.pantryStaples ?? []).filter((k) => k !== item?.key),
  };
}

export const setLow = (list: PantryItem[], id: string, low: boolean): PantryItem[] =>
  list.map((p) => (p.id === id ? { ...p, low } : p));

/**
 * Recipe ingredients that look like pantry things (spices, oils, sauces, measured by the spoon, "to taste",
 * and the dry part of starches like rice), not yet in the pantry: one tap each to add.
 */
export function pantrySuggestions(recipes: Recipe[], s: Pick<Settings, 'pantry' | 'pantryStaples'>): { name: string; key: string }[] {
  const have = new Set(pantryKeys(s));
  const names = new Set((s.pantry ?? []).map((p) => p.name.toLowerCase()));
  const out = new Map<string, string>();
  for (const r of recipes) {
    for (const i of r.items) {
      const key = foodKey(i.food, i.name);
      if (have.has(key) || names.has(i.name.toLowerCase()) || out.has(key)) continue;
      const aisle = aisleFor(i);
      const spoon = /^(tbsp|tsp|pinch|dash)/.test(i.unit) || i.amount === null;
      const dry = /\b(rice|oats|pasta|quinoa|lentils?|couscous|noodles|flour|sugar)\b/i.test(i.name) && aisle !== 'Frozen' && aisle !== 'Canned & jarred';
      if (spoon || dry || aisle === 'Spices & baking' || aisle === 'Oils & sauces') out.set(key, i.name);
    }
  }
  return [...out].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
}
