// Meals in an import file (Nov 2026): "Nov 2–6, lunch was Grilled Sausage & Black Beans", so meals Sam already ate
// (or plans) can be brought in with one paste instead of tapping each day. A dish gets its usual side, sized like
// the weeks planner does it. Past days come in eaten, pinned to a cooked batch on the Sunday before (made here if
// there isn't one, sized to the meals), so history and the weekly average add up. Planned weeks get their Sunday
// cook day set up and sized just as the weeks planner does it. A `cooks` list adds extra cook days (e.g. a second pot
// for the freezer). Days that already have the same meal in that slot, and cook days already there, are left alone,
// so importing the same file twice doesn't double anything.

import type { Batch, CalendarEntry, CustomFood, Nutrition, Recipe, Slot } from './model';
import { customUnits } from './bank';
import { dishEach } from './cookdays';
import { unitGrams } from './import-recipes';
import { addDays, weekStart } from './plan';
import { times } from './recipe-math';
import { fmtAmount } from './units';
import type { Food } from './usda';
import { choiceDraft, cookDayFor, defaultChoice, sideOf, sizedBatch, syncCookDay, type Choice } from './weeks';

export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface FileMeal {
  /** First day, YYYY-MM-DD. */
  from: string;
  /** Last day (same as `from` if left out), inclusive. */
  to?: string | null;
  slot: Slot;
  /** A recipe (dish) by name, eaten with its usual side. */
  dish?: string | null;
  /** Or a food: one of My foods, else a USDA food, by name. */
  food?: string | null;
  /** Food: how much, in the food's unit (a My food's serving if left out). Dish: servings (default 1). */
  amount?: number | null;
  unit?: string | null;
}

/** An extra cook day: `servings` of a dish on `date` (planned; e.g. a pot for the freezer). */
export interface FileCook {
  date: string;
  dish: string;
  servings: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Check one meal line from a file; throws a plain-language error naming it. */
export function checkMeal(m: FileMeal, i: number) {
  const what = `Meal ${i + 1}`;
  if (!m || !ISO.test(m.from ?? '') || (m.to && !ISO.test(m.to))) throw new Error(`${what} needs dates like "2026-11-02".`);
  if (!SLOTS.includes(m.slot)) throw new Error(`${what}: slot must be breakfast, lunch, dinner or snack.`);
  if (!m.dish === !m.food) throw new Error(`${what} needs a dish or a food (one of them).`);
}

export function checkCook(c: FileCook, i: number) {
  if (!c || !ISO.test(c.date ?? '') || !c.dish || !(Number(c.servings) > 0)) {
    throw new Error(`Cook day ${i + 1} needs a date like "2026-11-08", a dish and how many servings.`);
  }
}

export function daysOf(m: FileMeal): string[] {
  const out: string[] = [];
  for (let d = m.from; d <= (m.to || m.from) && out.length < 366; d = addDays(d, 1)) out.push(d);
  return out;
}

export interface MealContext {
  recipes: Recipe[];
  customFoods: CustomFood[];
  /** What's on the calendar already. */
  entries: CalendarEntry[];
  batches: Batch[];
  proteinPerMeal: number;
  mealKcalAim: number;
  /** USDA food for a name (the import's matching). */
  usdaFor: (name: string) => Food | undefined;
  /** Days before this are eaten. */
  today: string;
  newId: () => string;
  now: string;
}

export interface MealResult {
  entries: CalendarEntry[];
  batches: Batch[];
  /** Days left alone because that meal was already there. */
  already: number;
  /** Planned cook days whose size changed to fit the meals (the weeks planner's own ones). */
  updated: Batch[];
  /** Lines that couldn't be used, with why. */
  problems: string[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const plain = (n: Nutrition): Nutrition => ({ kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat });

/** The calendar entries (and cooked batches) for a file's meals. Nothing is saved here. */
export function buildMeals(meals: FileMeal[], c: MealContext, cooks: FileCook[] = []): MealResult {
  const out: MealResult = { entries: [], batches: [], updated: [], already: 0, problems: [] };
  const cookDateOf = (date: string) => cookDayFor(weekStart(date));
  const taken = (date: string, slot: Slot, label: string) =>
    [...c.entries, ...out.entries].some((e) => e.date === date && e.slot === slot && same(e.label, label));

  // Servings each past cook day has to have made: every eaten dish meal in the file, by recipe and Sunday.
  const need = new Map<string, number>();
  for (const m of meals) {
    const r = m.dish ? c.recipes.find((x) => same(x.name, m.dish!)) : undefined;
    if (!r) continue;
    for (const d of daysOf(m)) {
      if (d >= c.today) continue;
      const k = `${r.id}|${cookDateOf(d)}`;
      need.set(k, (need.get(k) ?? 0) + (m.amount || 1));
    }
  }
  const batchFor = (r: Recipe, cookDate: string): Batch => {
    const found = [...c.batches, ...out.batches].find((b) => b.recipeId === r.id && b.cookDate === cookDate);
    if (found) return found;
    const made: Batch = {
      ...sizedBatch(r, need.get(`${r.id}|${cookDate}`) ?? 1, cookDate, c.proteinPerMeal, c.newId(), c.now),
      status: 'cooked', auto: undefined,
    };
    out.batches.push(made);
    return made;
  };

  meals.forEach((m, i) => {
    if (m.dish) {
      const r = c.recipes.find((x) => same(x.name, m.dish!) && x.kind === 'dish');
      if (!r) return void out.problems.push(`Meal ${i + 1}: no dish called "${m.dish}" in Recipes (import the recipes first).`);
      const side = sideOf(r, c.recipes);
      for (const date of daysOf(m)) {
        const eaten = date < c.today;
        const batch = eaten ? batchFor(r, cookDateOf(date)) : undefined;
        const each = dishEach(batch, r, c.proteinPerMeal);
        const one = defaultChoice(r, c.recipes, each, c.mealKcalAim);
        const k = m.amount || 1;
        const choice: Choice = { ...one, portions: k, ...(one.starch ? { starch: { ...one.starch, cups: one.starch.cups * k } } : {}) };
        const draft = choiceDraft(choice, r, side, each);
        if (taken(date, m.slot, draft.label)) { out.already++; continue; }
        const source = batch && draft.source.kind === 'dish' ? { ...draft.source, batchId: batch.id } : draft.source;
        out.entries.push({ id: c.newId(), date, slot: m.slot, eaten, ...draft, source });
      }
      return;
    }
    const name = m.food!;
    const amount = m.amount || 1;
    let draft: Pick<CalendarEntry, 'label' | 'nutrition' | 'source'>;
    const mine = c.customFoods.find((f) => same(f.name, name));
    if (mine) {
      const units = customUnits(mine);
      const u = m.unit ? units.find((x) => same(x.unit, m.unit!)) : units[0];
      if (!u) return void out.problems.push(`Meal ${i + 1}: "${name}" has no unit "${m.unit}".`);
      const label = u === units[0] && amount === 1 ? mine.name : `${mine.name} (${fmtAmount(amount)} ${u.unit})`;
      draft = { label, nutrition: times(u.per, amount), source: { kind: 'food', food: { kind: 'custom', id: mine.id }, amount, unit: u.unit } };
    } else {
      const food = c.usdaFor(name);
      if (!food) return void out.problems.push(`Meal ${i + 1}: couldn't find a food called "${name}".`);
      const unit = m.unit || 'g';
      const g = unitGrams(unit, food)?.grams;
      if (!g) return void out.problems.push(`Meal ${i + 1}: don't know how much "${unit}" of ${food.name} weighs.`);
      draft = {
        label: `${name} (${fmtAmount(amount)} ${unit})`,
        nutrition: plain(times(food.per100g, (g * amount) / 100)),
        source: { kind: 'food', food: { kind: 'usda', id: food.id }, amount, unit },
      };
    }
    for (const date of daysOf(m)) {
      if (taken(date, m.slot, draft.label)) { out.already++; continue; }
      out.entries.push({ id: c.newId(), date, slot: m.slot, eaten: date < c.today, ...draft });
    }
  });

  // Planned weeks: the Sunday cook day, as the weeks planner would set it up.
  const mondays = new Set(out.entries.filter((e) => !e.eaten && e.source.kind === 'dish').map((e) => weekStart(e.date)));
  for (const monday of mondays) {
    const all = [...c.batches, ...out.batches];
    const ch = syncCookDay(monday, [...c.entries, ...out.entries], all, c.recipes, c.proteinPerMeal, c.newId, c.now);
    out.batches.push(...ch.add);
    for (const b of ch.update) {
      const mine = out.batches.findIndex((x) => x.id === b.id);
      if (mine >= 0) out.batches[mine] = b;
      else out.updated.push(b);
    }
  }

  cooks.forEach((k, i) => {
    const r = c.recipes.find((x) => same(x.name, k.dish) && x.kind === 'dish');
    if (!r) return void out.problems.push(`Cook day ${i + 1}: no dish called "${k.dish}" in Recipes.`);
    if ([...c.batches, ...out.batches].some((b) => b.recipeId === r.id && b.cookDate === k.date)) return void out.already++;
    // Not auto: it's Sam's own cook day, so the weeks planner never resizes or removes it.
    out.batches.push({ ...sizedBatch(r, k.servings, k.date, c.proteinPerMeal, c.newId(), c.now), auto: undefined });
  });
  return out;
}
