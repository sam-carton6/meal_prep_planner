// The weeks planner (Nov 2026): Sam plans a week as "lunch is X, dinner is Y, Monday to Friday", cooked the Sunday
// before. A week row is read straight from the calendar (no extra storage): the dish most of the five days have is
// the row's dish; any day with something else is a swapped day and is left alone when the row changes. Weeks can be
// piecewise: e.g. chicken Mon–Wed, another dish Thu–Fri (cooked the same Sunday), a freezer container (a dish meal
// pinned to a cooked batch with freezer stock), takeout or leftovers. The Sunday cook day is set up and sized to the
// fresh dish meals of that week (Batch.auto) until Sam enters what he bought (editing it by hand) or marks it cooked.

import type { Batch, CalendarEntry, Nutrition, Recipe, Slot } from './model';
import { addDays } from './plan';
import { containersFor, perYieldUnit, sideStep, starchToReach } from './recipe-math';
import { dishLabel, dishNutrition } from './cookdays';
import type { EntryDraft } from './bank';

export const WEEK_SLOTS: Slot[] = ['lunch', 'dinner'];
export const weekdaysOf = (monday: string) => [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
/** Sam cooks the Sunday before the week. */
export const cookDayFor = (monday: string) => addDays(monday, -1);

/** What a row (or a day) is set to: a dish, how many servings, and its side. `cups` = side in the container. */
export interface Choice {
  recipeId: string;
  portions: number;
  starch?: { recipeId: string; cups: number };
}

export interface RowDay {
  date: string;
  entries: CalendarEntry[];
  /** main = the row's dish; other = swapped for something else; empty = nothing planned. */
  kind: 'main' | 'other' | 'empty';
  eaten: boolean;
}

export interface WeekRow {
  slot: Slot;
  main?: Choice;
  days: RowDay[];
}

/** The dish of a fresh (cooked-this-week) meal; freezer meals (fromStock) are swapped days. */
const dishOf = (e: CalendarEntry) => (e.source.kind === 'dish' && !e.source.fromStock ? e.source.recipeId : undefined);

export function weekRow(entries: CalendarEntry[], monday: string, slot: Slot): WeekRow {
  const dates = weekdaysOf(monday);
  const byDay = dates.map((d) => entries.filter((e) => e.date === d && e.slot === slot));
  const count = new Map<string, number>();
  for (const es of byDay) {
    const rid = es.length === 1 ? dishOf(es[0]) : undefined;
    if (rid) count.set(rid, (count.get(rid) ?? 0) + 1);
  }
  let mainId: string | undefined;
  for (const [rid, n] of count) if (!mainId || n > count.get(mainId)!) mainId = rid;
  const first = byDay.flat().find((e) => dishOf(e) === mainId);
  let main: Choice | undefined;
  if (first && first.source.kind === 'dish') {
    const { recipeId, portions, starch } = first.source;
    // Stored per serving on the entry; the row shows what's in the container.
    main = { recipeId, portions, ...(starch ? { starch: { recipeId: starch.recipeId, cups: Math.round(starch.cups * portions * 100) / 100 } } : {}) };
  }
  return {
    slot,
    main,
    days: dates.map((date, i) => {
      const es = byDay[i];
      const kind = !es.length ? 'empty' : es.length === 1 && dishOf(es[0]) === mainId ? 'main' : 'other';
      return { date, entries: es, kind, eaten: es.some((e) => e.eaten) };
    }),
  };
}

export interface CalendarChange {
  add: CalendarEntry[];
  remove: string[];
}

/**
 * Set a row to a dish (or clear it with null). Days that are the row's dish or empty get the new choice; swapped
 * days and eaten days stay as they are.
 */
export function setRow(
  entries: CalendarEntry[],
  monday: string,
  slot: Slot,
  choice: Choice | null,
  draft: (c: Choice) => EntryDraft,
  newId: () => string,
): CalendarChange {
  const out: CalendarChange = { add: [], remove: [] };
  for (const day of weekRow(entries, monday, slot).days) {
    if (day.eaten || day.kind === 'other') continue;
    out.remove.push(...day.entries.map((e) => e.id));
    if (choice) out.add.push({ id: newId(), date: day.date, slot, eaten: false, ...draft(choice) });
  }
  return out;
}

/**
 * Servings of each dish the Sunday cook day has to make: every fresh dish meal Monday–Saturday (any slot), plus
 * eaten ones that came from that Sunday. Freezer meals come from their own batch and don't count.
 */
export function weekNeeds(entries: CalendarEntry[], monday: string, batches: Batch[] = []): Map<string, number> {
  const cookDate = cookDayFor(monday);
  const thatSunday = new Set(batches.filter((b) => b.cookDate === cookDate).map((b) => b.id));
  const last = addDays(monday, 5);
  const need = new Map<string, number>();
  for (const e of entries) {
    if (e.source.kind !== 'dish' || e.source.fromStock || e.date < monday || e.date > last) continue;
    const pin = e.source.batchId;
    if (pin && !thatSunday.has(pin)) continue;
    need.set(e.source.recipeId, (need.get(e.source.recipeId) ?? 0) + e.source.portions);
  }
  return need;
}

/**
 * A planned cook day of `recipe` that makes `servings` servings: every amount scaled exactly (no rounding to whole
 * cans here, so a small batch's numbers stay true; the shopping list rounds what to buy up to whole cans).
 */
export function sizedBatch(recipe: Recipe, servings: number, cookDate: string, proteinPerMeal: number, id: string, now: string): Batch {
  const base = containersFor(recipe, recipe.items, proteinPerMeal);
  const k = servings / Math.max(1e-9, base);
  const items = recipe.items.map((i) => (i.amount === null || i.scaling === 'fixed' ? { ...i } : { ...i, amount: i.amount * k }));
  return {
    id, recipeId: recipe.id, recipeName: recipe.name, status: 'planned', cookDate, items,
    portions: Math.round(servings * 100) / 100, fridge: 0, freezer: 0, createdAt: now, auto: true,
  };
}

export interface CookChange {
  add: Batch[];
  update: Batch[];
  remove: string[];
}

/**
 * Keep the Sunday cook day in step with the week: one auto cook day per dish the week needs, sized to it; auto
 * ones no longer needed go. Cook days Sam set up or edited himself, and cooked ones, are never touched.
 */
export function syncCookDay(
  monday: string,
  entries: CalendarEntry[],
  batches: Batch[],
  recipes: Recipe[],
  proteinPerMeal: number,
  newId: () => string,
  now = new Date().toISOString(),
): CookChange {
  const out: CookChange = { add: [], update: [], remove: [] };
  const cookDate = cookDayFor(monday);
  const onDay = batches.filter((b) => b.cookDate === cookDate);
  const needs = weekNeeds(entries, monday, batches);
  const editable = (b: Batch) => b.auto && b.status === 'planned';
  for (const [rid, n] of needs) {
    const recipe = recipes.find((r) => r.id === rid);
    if (!recipe || n <= 0) continue;
    const existing = onDay.find((b) => b.recipeId === rid);
    if (!existing) out.add.push(sizedBatch(recipe, n, cookDate, proteinPerMeal, newId(), now));
    else if (editable(existing) && Math.abs(existing.portions - n) > 1e-9) {
      out.update.push({ ...sizedBatch(recipe, n, cookDate, proteinPerMeal, existing.id, existing.createdAt), notes: existing.notes });
    }
  }
  for (const b of onDay) if (editable(b) && !needs.has(b.recipeId)) out.remove.push(b.id);
  return out;
}

// ---- Turning a choice into a calendar entry -----------------------------------------------------------

/** The side a dish is usually eaten with (Recipe.serveWith, by name). */
export const sideOf = (dish: Recipe, recipes: Recipe[]) => {
  const want = dish.serveWith?.trim().toLowerCase();
  return want ? recipes.find((r) => r.kind === 'starch' && r.name.trim().toLowerCase() === want) : undefined;
};

/** Measured in cups (rice) rather than whole things (a salad bowl). */
export const byCup = (side: Recipe) => sideStep(side.yieldUnit) !== 0.5;

/** A new row: 1 serving with its usual side, enough of it (to the ¼ cup) to reach the calorie aim; a bowl is 1. */
export function defaultChoice(dish: Recipe, recipes: Recipe[], each: Nutrition, aimKcal: number): Choice {
  const side = sideOf(dish, recipes);
  if (!side) return { recipeId: dish.id, portions: 1 };
  const per = perYieldUnit(side).kcal;
  const cups = byCup(side) ? starchToReach(each.kcal, aimKcal, Math.max(1, per), sideStep(side.yieldUnit)) : 1;
  return { recipeId: dish.id, portions: 1, starch: { recipeId: side.id, cups } };
}

/** The calendar entry for a choice. `each` = one serving of the dish. */
export function choiceDraft(c: Choice, dish: Recipe, side: Recipe | undefined, each: Nutrition): EntryDraft {
  const cups = side && c.starch ? c.starch.cups / c.portions : 0; // per serving, as entries store it
  return {
    label: dishLabel(dish.name, c.portions, side, cups * c.portions),
    nutrition: dishNutrition(each, c.portions, side, cups),
    source: { kind: 'dish', recipeId: dish.id, portions: c.portions, ...(side && c.starch ? { starch: { recipeId: side.id, cups } } : {}) },
  };
}

/** A container from a cooked batch's stock (freezer), for a swapped day. */
export function stockDraft(batch: Batch, dish: Recipe | undefined, each: Nutrition): EntryDraft {
  return {
    label: `${batch.recipeName} (freezer)`,
    nutrition: each,
    source: { kind: 'dish', recipeId: dish?.id ?? batch.recipeId, portions: 1, batchId: batch.id, fromStock: true },
  };
}
