// The meal bank: ready-made cards for the calendar, built from the real data. One card per dish, per dish +
// starch, per My foods entry, and per recent other food. Each card can be tweaked (servings, cups of starch,
// scoops...) before it's placed; recent use sets the starting amounts.

import type { Batch, CalendarEntry, CustomFood, Nutrition, Recipe } from './model';
import { ZERO } from './model';
import { dishEach, dishLabel, dishNutrition, typicalBatch } from './cookdays';
import { perYieldUnit, starchToReach, times } from './recipe-math';
import { fmtAmount, stepFor } from './units';

export type EntryDraft = Pick<CalendarEntry, 'label' | 'nutrition' | 'source'>;

export interface CardUnit {
  unit: string;
  /** Nutrition of one of this unit. */
  per: Nutrition;
  step: number;
}

export type MealCard =
  | { id: string; group: 'prep'; name: string; recipeId: string; each: Nutrition; starch?: Recipe; defaults: Values }
  | { id: string; group: 'food'; name: string; place?: string; foodId: string; units: CardUnit[]; defaults: Values }
  | { id: string; group: 'recent'; name: string; draft: EntryDraft; units: CardUnit[]; defaults: Values };

/** Tweak values: servings, cups (starch on the plate), amount, unit (index into units). */
export type Values = Partial<Record<'servings' | 'cups' | 'amount' | 'unit', number>>;

export interface CardTweak {
  key: 'servings' | 'cups' | 'amount';
  n: number;
  text: string;
  step: number;
  min: number;
  /** Tapping the unit switches to the next one (My foods with several units). */
  canCycle?: boolean;
}

/** Card key of what an entry was, so recent use can set a card's starting amounts and order. */
export function entryCardId(e: Pick<CalendarEntry, 'source' | 'label'>, batchRecipe: (batchId: string) => string | undefined) {
  const s = e.source;
  if (s.kind === 'dish' || s.kind === 'batch') {
    const rid = s.kind === 'dish' ? s.recipeId : batchRecipe(s.batchId);
    return rid ? `dish:${rid}${s.starch ? `+${s.starch.recipeId}` : ''}` : undefined;
  }
  if (s.kind === 'food' && s.food.kind === 'custom') return `food:${s.food.id}`;
  return `recent:${baseName(e.label).toLowerCase()}`;
}

/** "Oats, dry (1.5 cup)" → "Oats, dry". */
export const baseName = (label: string) => label.replace(/\s*\([^()]*\)\s*$/, '');

const unitLabel = (servingLabel: string) => servingLabel.replace(/^1\s+/, '').trim() || 'serving';

/** Units a My foods entry can be counted in: its serving, its extra units (scoop...), and grams. */
export function customUnits(f: CustomFood): CardUnit[] {
  const out: CardUnit[] = [{ unit: unitLabel(f.servingLabel), per: f.perServing, step: 0.5 }];
  if (f.servingGrams && f.servingGrams > 0) {
    for (const u of f.units ?? []) {
      if (u.grams > 0 && u.unit.trim()) out.push({ unit: u.unit.trim(), per: times(f.perServing, u.grams / f.servingGrams), step: 1 });
    }
    out.push({ unit: 'g', per: times(f.perServing, 1 / f.servingGrams), step: 10 });
  }
  return out;
}

function amountStep(unit: string) {
  if (unit === 'g' || unit === 'ml') return 10;
  if (unit === 'oz' || unit === 'fl oz') return 1;
  if (unit === 'lb' || unit === 'kg') return 0.25;
  return stepFor(unit) || 0.5;
}

export interface BankInput {
  recipes: Recipe[];
  batches: Batch[];
  customFoods: CustomFood[];
  /** Calendar entries, any order; the newest ones set starting amounts. */
  entries: CalendarEntry[];
  mealKcalAim: number;
  proteinPerMeal: number;
}

export function buildCards(input: BankInput): MealCard[] {
  const { recipes, batches, customFoods, mealKcalAim, proteinPerMeal } = input;
  const recipeOfBatch = new Map(batches.map((b) => [b.id, b.recipeId]));
  const newest = [...input.entries].sort((a, b) => b.date.localeCompare(a.date));
  const last = new Map<string, CalendarEntry>();
  for (const e of newest) {
    const id = entryCardId(e, (b) => recipeOfBatch.get(b));
    if (id && !last.has(id)) last.set(id, e);
  }

  const cards: MealCard[] = [];
  const starches = recipes.filter((r) => r.kind === 'starch');
  for (const d of recipes.filter((r) => r.kind === 'dish')) {
    const each = dishEach(typicalBatch(batches, d.id), d, proteinPerMeal);
    const prev = last.get(`dish:${d.id}`);
    cards.push({ id: `dish:${d.id}`, group: 'prep', name: d.name, recipeId: d.id, each,
      defaults: { servings: prevPortions(prev) ?? 1 } });
    for (const s of starches) {
      const id = `dish:${d.id}+${s.id}`;
      const p = last.get(id);
      const prevCups = p && (p.source.kind === 'dish' || p.source.kind === 'batch') && p.source.starch
        ? p.source.starch.cups * p.source.portions : undefined;
      const suggested = starchToReach(each.kcal, mealKcalAim, perYieldUnit(s).kcal);
      cards.push({ id, group: 'prep', name: d.name, recipeId: d.id, each, starch: s,
        defaults: { servings: prevPortions(p) ?? 1, cups: prevCups ?? suggested } });
    }
  }

  // My foods made only as recipe ingredients (e.g. chipotle peppers in adobo) aren't meals: skip them until used.
  const ingredientOnly = new Set(recipes.flatMap((r) => r.items).flatMap((i) => (i.food.kind === 'custom' ? [i.food.id] : [])));
  for (const f of customFoods) {
    if (ingredientOnly.has(f.id) && !last.has(`food:${f.id}`)) continue;
    const units = customUnits(f);
    const prev = last.get(`food:${f.id}`);
    const prevUnit = prev?.source.kind === 'food' ? units.findIndex((u) => u.unit === (prev.source as { unit: string }).unit) : -1;
    const unit = prevUnit >= 0 ? prevUnit : units.length > 2 ? 1 : 0; // an extra unit (scoop) beats "serving"
    const amount = prevUnit >= 0 && prev?.source.kind === 'food' ? prev.source.amount : unit === 0 ? 1 : units[unit].step;
    cards.push({ id: `food:${f.id}`, group: 'food', name: f.name.trim(), place: f.place, foodId: f.id, units,
      defaults: { unit, amount } });
  }

  const seen = new Set<string>();
  for (const e of newest) {
    if (e.source.kind === 'food' ? e.source.food.kind === 'custom' : e.source.kind !== 'quick') continue;
    const id = `recent:${baseName(e.label).toLowerCase()}`;
    if (seen.has(id) || seen.size >= 8) continue;
    seen.add(id);
    const draft: EntryDraft = { label: e.label, nutrition: e.nutrition, source: e.source };
    const units: CardUnit[] = e.source.kind === 'food' && e.source.amount > 0
      ? [{ unit: e.source.unit, per: times(e.nutrition, 1 / e.source.amount), step: amountStep(e.source.unit) }]
      : [];
    cards.push({ id, group: 'recent', name: baseName(e.label), draft, units,
      defaults: units.length && e.source.kind === 'food' ? { amount: e.source.amount, unit: 0 } : {} });
  }

  // Most recently used first; never-used cards keep their place after them (dishes, then foods).
  const when = (c: MealCard) => last.get(c.id)?.date ?? '';
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => when(b.c).localeCompare(when(a.c)) || a.i - b.i)
    .map((x) => x.c);
}

function prevPortions(e: CalendarEntry | undefined) {
  return e && (e.source.kind === 'dish' || e.source.kind === 'batch') ? e.source.portions : undefined;
}

/** The card's values with any tweaks applied, kept to sensible amounts. */
export function cardValues(card: MealCard, tweaks: Values = {}): Values {
  const v: Values = { ...card.defaults, ...tweaks };
  if (card.group !== 'prep') {
    const n = card.units.length;
    v.unit = n ? Math.min(n - 1, Math.max(0, v.unit ?? 0)) : undefined;
  }
  return v;
}

export function cardTweaks(card: MealCard, tweaks: Values = {}): CardTweak[] {
  const v = cardValues(card, tweaks);
  if (card.group === 'prep') {
    const s = v.servings ?? 1;
    const out: CardTweak[] = [{ key: 'servings', n: s, text: s === 1 ? 'serving' : 'servings', step: 0.5, min: 0.5 }];
    if (card.starch) {
      out.push({ key: 'cups', n: v.cups ?? 0, text: `${(card.starch.yieldUnit ?? 'cup').replace(/ cooked$/, '')} ${card.starch.name.split(',')[0].toLowerCase()}`, step: 0.25, min: 0 });
    }
    return out;
  }
  const u = card.units[v.unit ?? 0];
  if (!u) return [];
  return [{ key: 'amount', n: v.amount ?? 1, text: u.unit, step: u.step, min: u.step, canCycle: card.units.length > 1 }];
}

/** Change one tweak by a step (dir = +1 / −1), or switch unit. Returns the new tweaks to store. */
export function stepTweak(card: MealCard, tweaks: Values, key: CardTweak['key'] | 'unit', dir: 1 | -1): Values {
  const v = cardValues(card, tweaks);
  if (key === 'unit') {
    if (card.group === 'prep' || card.units.length < 2) return tweaks;
    const unit = ((v.unit ?? 0) + 1) % card.units.length;
    const u = card.units[unit];
    return { ...tweaks, unit, amount: unit === 0 ? 1 : u.unit === 'g' ? 100 : u.step };
  }
  const t = cardTweaks(card, tweaks).find((x) => x.key === key);
  if (!t) return tweaks;
  const n = Math.max(t.min, Math.round((t.n + dir * t.step) / t.step) * t.step);
  return { ...tweaks, [key]: Math.round(n * 1000) / 1000 };
}

/** The calendar entry a card makes with these tweaks. */
export function cardEntry(card: MealCard, tweaks: Values = {}): EntryDraft {
  const v = cardValues(card, tweaks);
  if (card.group === 'prep') {
    const portions = v.servings ?? 1;
    const cups = card.starch ? v.cups ?? 0 : 0;
    const perPortion = cups / portions;
    return {
      label: dishLabel(card.name, portions, card.starch, cups),
      nutrition: dishNutrition(card.each, portions, card.starch, perPortion),
      source: {
        kind: 'dish',
        recipeId: card.recipeId,
        portions,
        ...(card.starch && cups > 0 ? { starch: { recipeId: card.starch.id, cups: perPortion } } : {}),
      },
    };
  }
  const u = card.units[v.unit ?? 0];
  if (!u) return card.group === 'recent' ? card.draft : { label: card.name, nutrition: ZERO, source: { kind: 'quick' } };
  const amount = v.amount ?? 1;
  const isOneServing = card.group === 'food' && v.unit === 0 && amount === 1;
  const label = isOneServing ? card.name : `${card.name} (${fmtAmount(amount)} ${u.unit})`;
  const food = card.group === 'food' ? { kind: 'custom' as const, id: card.foodId }
    : card.draft.source.kind === 'food' ? card.draft.source.food : { kind: 'none' as const };
  return { label, nutrition: times(u.per, amount), source: { kind: 'food', food, amount, unit: u.unit } };
}

// ---- "What gets me to my target?" -----------------------------------------------------------------

export interface Targets {
  /** Protein per meal, g (More → Targets). */
  protein: number;
  /** Calories per container the starch is aimed at (More → Targets). */
  kcal: number;
}

export interface Suggestion {
  /** "40 g protein: 1¼ servings" (rounded up to reach it) */
  text: string;
  servings: number;
  cups: number;
}

const quarter = (n: number) => Math.round(n * 4) / 4;

/**
 * For a dish container (optionally with starch): how many servings reach the protein target, and how much starch
 * (or, without starch, how many servings) reaches the calorie target. Suggestions equal to what's set are left out.
 */
export function dishSuggestions(
  each: Nutrition,
  starch: { per: Nutrition; text: string } | undefined,
  servings: number,
  cups: number,
  t: Targets,
): Suggestion[] {
  const out: Suggestion[] = [];
  const word = (s: number) => (s <= 1 ? 'serving' : 'servings');
  if (t.protein > 0 && each.protein > 0) {
    // Round up: the point is to get at least the protein target.
    const s = Math.max(0.25, Math.ceil(((t.protein - cups * (starch?.per.protein ?? 0)) / each.protein) * 4 - 1e-9) / 4);
    if (s !== servings) out.push({ text: `${t.protein} g protein: ${fmtAmount(s)} ${word(s)}`, servings: s, cups });
  }
  if (t.kcal > 0) {
    if (starch && starch.per.kcal > 0) {
      const c = Math.max(0, quarter((t.kcal - servings * each.kcal) / starch.per.kcal));
      if (c !== cups) out.push({ text: `${t.kcal} kcal: ${fmtAmount(c)} ${starch.text}`, servings, cups: c });
    } else if (!starch && each.kcal > 0) {
      const s = Math.max(0.25, quarter(t.kcal / each.kcal));
      if (s !== servings) out.push({ text: `${t.kcal} kcal: ${fmtAmount(s)} ${word(s)}`, servings: s, cups });
    }
  }
  return out;
}

/** Suggestions for a meal bank card, as tweaks to apply when tapped. */
export function cardSuggestions(card: MealCard, tweaks: Values, t: Targets): { text: string; tweaks: Values }[] {
  if (card.group !== 'prep') return [];
  const v = cardValues(card, tweaks);
  const starch = card.starch
    ? { per: perYieldUnit(card.starch), text: cardTweaks(card, tweaks).find((x) => x.key === 'cups')!.text }
    : undefined;
  return dishSuggestions(card.each, starch, v.servings ?? 1, v.cups ?? 0, t).map((s) => ({
    text: s.text,
    tweaks: { ...tweaks, servings: s.servings, ...(card.starch ? { cups: s.cups } : {}) },
  }));
}
