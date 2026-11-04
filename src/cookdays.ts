// Cook days: Sam picks the days he cooks (a Batch per cook day). This works out which cook day feeds each planned
// meal (the latest one of that recipe on or before the meal), how many containers that is, what's spare (extra
// food, e.g. for someone else), what's short, which containers go in the freezer (eaten more than FRIDGE_DAYS after
// cooking), and which meals have no cook day before them. Nothing here is stored: it's worked out from the plan.

import type { Batch, CalendarEntry, Nutrition, Recipe, Slot } from './model';
import { SLOTS, ZERO } from './model';
import { parseDate } from './plan';
import { add, batchSummary, perPortion, perYieldUnit, portionsForProtein, times, totals } from './recipe-math';
import { fmtAmount } from './units';

/** Containers eaten more than this many days after cooking should go in the freezer. */
export const FRIDGE_DAYS = 4;

export const daysBetween = (from: string, to: string) =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 864e5);

const slotOrder = (s: Slot) => SLOTS.indexOf(s);
export const byTime = (a: CalendarEntry, b: CalendarEntry) =>
  a.date.localeCompare(b.date) || slotOrder(a.slot) - slotOrder(b.slot);

/** The batch an entry is tied to for good (old pinned entries, and dish meals once eaten). */
export function pinnedBatch(e: CalendarEntry): string | undefined {
  if (e.source.kind === 'batch') return e.source.batchId;
  if (e.source.kind === 'dish') return e.source.batchId;
  return undefined;
}

/** Containers (portions) an entry uses: 0 for plain foods. */
export const entryPortions = (e: CalendarEntry) =>
  e.source.kind === 'batch' || e.source.kind === 'dish' ? e.source.portions : 0;

/** Starch on a container entry, as total yield units (cups) for the whole entry. */
export function entryStarch(e: CalendarEntry): { recipeId: string; cups: number } | undefined {
  if ((e.source.kind === 'batch' || e.source.kind === 'dish') && e.source.starch) {
    return { recipeId: e.source.starch.recipeId, cups: e.source.starch.cups * e.source.portions };
  }
  return undefined;
}

export interface CookDayInfo {
  batch: Batch;
  /** Containers it can feed: a planned batch → all its portions; a cooked one → what's in the fridge + freezer. */
  capacity: number;
  /** Meals it feeds, in date order. */
  entries: CalendarEntry[];
  /** Containers planned from it (not yet eaten, for cooked batches). */
  used: number;
  spare: number;
  short: number;
  /** Containers eaten more than FRIDGE_DAYS after cooking. */
  freeze: number;
}

export interface Coverage {
  cookDays: Map<string, CookDayInfo>;
  /** Entry id → id of the batch that feeds it. */
  feeds: Map<string, string>;
  /** Entries beyond what their cook day makes. */
  short: Set<string>;
  /** Entries more than FRIDGE_DAYS after their cook day. */
  frozen: Set<string>;
  /** Planned dish meals with no cook day on or before them. */
  uncovered: CalendarEntry[];
}

/** Batches that can still feed new meals of a recipe, latest cook day first. */
function feeders(batches: Batch[], recipeId: string): Batch[] {
  return batches
    .filter((b) => b.recipeId === recipeId && (b.status === 'planned' || b.fridge + b.freezer > 0))
    .sort((a, b) => b.cookDate.localeCompare(a.cookDate) || b.createdAt.localeCompare(a.createdAt));
}

export function coverage(entries: CalendarEntry[], batches: Batch[]): Coverage {
  const cookDays = new Map<string, CookDayInfo>();
  for (const b of batches) {
    cookDays.set(b.id, {
      batch: b,
      capacity: b.status === 'planned' ? b.portions : b.fridge + b.freezer,
      entries: [],
      used: 0,
      spare: 0,
      short: 0,
      freeze: 0,
    });
  }
  const out: Coverage = { cookDays, feeds: new Map(), short: new Set(), frozen: new Set(), uncovered: [] };
  const cache = new Map<string, Batch[]>();

  for (const e of [...entries].sort(byTime)) {
    let id = pinnedBatch(e);
    if (!id && e.source.kind === 'dish') {
      if (e.eaten) continue; // eaten with no cook day: nothing to feed
      const rid = e.source.recipeId;
      const list = cache.get(rid) ?? cache.set(rid, feeders(batches, rid)).get(rid)!;
      const b = list.find((x) => x.cookDate <= e.date);
      if (!b) {
        out.uncovered.push(e);
        continue;
      }
      id = b.id;
    }
    const day = id ? cookDays.get(id) : undefined;
    if (!day) continue;
    out.feeds.set(e.id, day.batch.id);
    day.entries.push(e);
  }

  for (const day of cookDays.values()) {
    const planned = day.batch.status === 'planned';
    let used = 0;
    for (const e of day.entries) {
      if (!planned && e.eaten) continue; // already out of a cooked batch's stock
      const p = entryPortions(e);
      used += p;
      if (used > day.capacity + 1e-9) {
        out.short.add(e.id);
        continue;
      }
      if (!e.eaten && daysBetween(day.batch.cookDate, e.date) > FRIDGE_DAYS) {
        out.frozen.add(e.id);
        day.freeze += p;
      }
    }
    day.used = used;
    day.spare = Math.max(0, day.capacity - used);
    day.short = Math.max(0, used - day.capacity);
  }
  return out;
}

// ---- Nutrition of a container --------------------------------------------------------------------

/** The batch that best stands for a recipe right now (latest cook day), for numbers before a cook day exists. */
export function typicalBatch(batches: Batch[], recipeId: string): Batch | undefined {
  return batches
    .filter((b) => b.recipeId === recipeId)
    .sort((a, b) => b.cookDate.localeCompare(a.cookDate) || b.createdAt.localeCompare(a.createdAt))[0];
}

/** One container of a dish: from its batch, else from the recipe split by the protein target. */
export function dishEach(batch: Batch | undefined, recipe: Recipe | undefined, proteinPerMeal: number): Nutrition {
  if (batch) return batchSummary(batch).each;
  if (!recipe) return ZERO;
  const t = totals(recipe.items);
  return perPortion(t, portionsForProtein(t, proteinPerMeal));
}

/** A whole entry: `portions` containers, each with `cupsPerPortion` of the starch. */
export function dishNutrition(each: Nutrition, portions: number, starch?: Recipe, cupsPerPortion = 0): Nutrition {
  const withStarch = starch && cupsPerPortion > 0 ? add(each, times(perYieldUnit(starch), cupsPerPortion)) : each;
  return times(withStarch, portions);
}

const shortName = (s: string) => s.split(',')[0].toLowerCase();
const yieldWord = (s: Recipe) => (s.yieldUnit ?? 'cup').replace(/ cooked$/, '');

/** "Chili", "Chili ×1½", "Chili + 1¾ cup rice". `cups` is the total on the plate. */
export function dishLabel(dishName: string, portions: number, starch?: Recipe, cups = 0): string {
  const amount = portions !== 1 ? ` ×${fmtAmount(portions)}` : '';
  const side = starch && cups > 0 ? ` + ${fmtAmount(cups)} ${yieldWord(starch)} ${shortName(starch.name)}` : '';
  return `${dishName}${amount}${side}`;
}

/**
 * Planned (not eaten) container meals get today's numbers from the batch that feeds them, so entering what you
 * bought on a cook day updates the calendar. Eaten meals keep the numbers they were logged with.
 */
export function liveEntries(
  entries: CalendarEntry[],
  cov: Coverage,
  batches: Batch[],
  recipes: Recipe[],
  proteinPerMeal: number,
): CalendarEntry[] {
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  return entries.map((e) => {
    if (e.eaten || (e.source.kind !== 'dish' && e.source.kind !== 'batch')) return e;
    const fed = batchById.get(cov.feeds.get(e.id) ?? '');
    const recipeId = e.source.kind === 'dish' ? e.source.recipeId : fed?.recipeId;
    if (!recipeId) return e;
    const batch = fed ?? typicalBatch(batches, recipeId);
    const recipe = recipeById.get(recipeId);
    if (!batch && !recipe) return e;
    const each = dishEach(batch, recipe, proteinPerMeal);
    const starch = e.source.starch ? recipeById.get(e.source.starch.recipeId) : undefined;
    if (e.source.starch && !starch) return e; // starch recipe gone: keep the saved numbers
    return { ...e, nutrition: dishNutrition(each, e.source.portions, starch, e.source.starch?.cups ?? 0) };
  });
}
