import { describe, expect, it } from 'vitest';
import type { Batch, CalendarEntry, Recipe, RecipeItem, Slot } from './model';
import { coverage, dishLabel, dishNutrition, entryStarch, liveEntries } from './cookdays';

const item = (grams: number, kcalPer100 = 200, proteinPer100 = 20): RecipeItem => ({
  id: 'i', name: 'Beef', food: { kind: 'none' }, per100g: { kcal: kcalPer100, protein: proteinPer100, carbs: 0, fat: 0 },
  amount: grams, unit: 'g', gramsPerUnit: 1, scaling: 'scale',
});

const batch = (id: string, cookDate: string, portions = 8, extra: Partial<Batch> = {}): Batch => ({
  id, recipeId: 'chili', recipeName: 'Chili', status: 'planned', cookDate, items: [item(1600)], portions,
  fridge: 0, freezer: 0, createdAt: id, ...extra,
});

let n = 0;
const meal = (date: string, slot: Slot = 'lunch', extra: Partial<CalendarEntry> = {}): CalendarEntry => ({
  id: `e${n++}`, date, slot, label: 'Chili', eaten: false, nutrition: { kcal: 1, protein: 1, carbs: 0, fat: 0 },
  source: { kind: 'dish', recipeId: 'chili', portions: 1 }, ...extra,
});

const rice: Recipe = {
  id: 'rice', name: 'White rice, long grain', kind: 'starch', yieldAmount: 12, yieldUnit: 'cup cooked',
  items: [item(1200, 100, 4)], createdAt: '', updatedAt: '',
};

describe('cook days', () => {
  it('feeds each meal from the latest cook day on or before it', () => {
    const meals = ['2026-11-02', '2026-11-03', '2026-11-07', '2026-11-08'].map((d) => meal(d));
    const sun = batch('sun', '2026-11-01');
    const fri = batch('fri', '2026-11-06');
    const cov = coverage(meals, [sun, fri]);
    expect(meals.map((m) => cov.feeds.get(m.id))).toEqual(['sun', 'sun', 'fri', 'fri']);
    expect(cov.cookDays.get('sun')!.used).toBe(2);
    expect(cov.cookDays.get('sun')!.spare).toBe(6); // extra food: for someone else, or more later
    expect(cov.uncovered).toHaveLength(0);
  });

  it('re-counts when a cook day goes away, and flags freezer containers (more than 4 days later)', () => {
    const meals = ['2026-11-02', '2026-11-05', '2026-11-06', '2026-11-08'].map((d) => meal(d));
    const cov = coverage(meals, [batch('sun', '2026-11-01')]);
    expect(cov.cookDays.get('sun')!.freeze).toBe(2); // the 6th (5 days) and the 8th
    expect(cov.frozen.has(meals[1].id)).toBe(false); // 4 days later: fridge is fine
    expect(cov.frozen.has(meals[2].id)).toBe(true);
  });

  it('warns about meals with no cook day before them, and meals beyond what a batch makes', () => {
    const early = meal('2026-10-31');
    const lots = Array.from({ length: 4 }, (_, i) => meal(`2026-11-0${i + 2}`));
    const cov = coverage([early, ...lots], [batch('sun', '2026-11-01', 3)]);
    expect(cov.uncovered.map((e) => e.id)).toEqual([early.id]);
    expect(cov.cookDays.get('sun')!.short).toBe(1);
    expect(cov.short.has(lots[3].id)).toBe(true); // the last one is the one that runs out
  });

  it('counts a 1½-serving meal as 1½ containers; a meal on the cook day itself is covered', () => {
    const cov = coverage([meal('2026-11-01', 'dinner', { source: { kind: 'dish', recipeId: 'chili', portions: 1.5 } })], [batch('sun', '2026-11-01')]);
    expect(cov.cookDays.get('sun')!.used).toBe(1.5);
  });

  it('uses what is left in a cooked batch, skips empty ones, and keeps eaten meals on their batch', () => {
    const old = batch('old', '2026-10-01', 8, { status: 'cooked', fridge: 0, freezer: 0 });
    const stock = batch('stock', '2026-10-20', 8, { status: 'cooked', fridge: 1, freezer: 1 });
    const eaten = meal('2026-10-30', 'lunch', { eaten: true, source: { kind: 'dish', recipeId: 'chili', portions: 1, batchId: 'stock' } });
    const a = meal('2026-11-02');
    const b = meal('2026-11-03');
    const c = meal('2026-11-04');
    const cov = coverage([eaten, a, b, c], [old, stock]);
    expect(cov.feeds.get(eaten.id)).toBe('stock');
    expect(cov.feeds.get(a.id)).toBe('stock');
    const s = cov.cookDays.get('stock')!;
    expect(s.capacity).toBe(2);
    expect(s.used).toBe(3); // the eaten one is already out of the fridge, so not counted
    expect(s.short).toBe(1);
    expect(cov.cookDays.get('old')!.entries).toHaveLength(0);
  });

  it('keeps old meals pinned to a batch on that batch', () => {
    const pinned = meal('2026-11-09', 'lunch', { source: { kind: 'batch', batchId: 'sun', portions: 1 } });
    const cov = coverage([pinned], [batch('sun', '2026-11-01'), batch('fri', '2026-11-06')]);
    expect(cov.feeds.get(pinned.id)).toBe('sun');
  });
});

describe('container numbers', () => {
  it('adds starch per container and scales by servings', () => {
    // 1 cup rice = 100 g → 100 kcal, 4 g protein
    const n = dishNutrition({ kcal: 400, protein: 40, carbs: 0, fat: 0 }, 1.5, rice, 1);
    expect(n.kcal).toBeCloseTo(750);
    expect(n.protein).toBeCloseTo(66);
    expect(entryStarch(meal('2026-11-02', 'lunch', { source: { kind: 'dish', recipeId: 'chili', portions: 2, starch: { recipeId: 'rice', cups: 0.75 } } }))!.cups).toBe(1.5);
  });

  it('labels containers in plain words', () => {
    expect(dishLabel('Chili', 1)).toBe('Chili');
    expect(dishLabel('Chili', 1.5)).toBe('Chili ×1½');
    expect(dishLabel('Chili', 1, rice, 1.75)).toBe('Chili + 1¾ cup white rice');
  });

  it('updates planned meals from their cook day (what you bought), but never eaten ones', () => {
    const sun = batch('sun', '2026-11-01', 8); // 1600 g × 200 kcal/100 g = 3200 kcal → 400 per container
    const planned = meal('2026-11-02');
    const eaten = meal('2026-11-03', 'lunch', { eaten: true, source: { kind: 'dish', recipeId: 'chili', portions: 1, batchId: 'sun' } });
    const cov = coverage([planned, eaten], [sun]);
    const [p, e] = liveEntries([planned, eaten], cov, [sun], [rice], 40);
    expect(p.nutrition.kcal).toBeCloseTo(400);
    expect(e.nutrition.kcal).toBe(1);
  });
});
