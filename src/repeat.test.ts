import { describe, expect, it } from 'vitest';
import type { Batch, CalendarEntry, RecipeItem, Slot } from './model';
import { repeatStart, repeatWeek } from './repeat';
import { coverage } from './cookdays';

const item: RecipeItem = {
  id: 'i', name: 'Beef', food: { kind: 'none' }, per100g: { kcal: 200, protein: 20, carbs: 0, fat: 0 },
  amount: 1000, unit: 'g', gramsPerUnit: 1, scaling: 'scale',
};
const batch = (id: string, cookDate: string, extra: Partial<Batch> = {}): Batch => ({
  id, recipeId: 'chili', recipeName: 'Chili', status: 'planned', cookDate, items: [item], portions: 5,
  fridge: 0, freezer: 0, createdAt: '', ...extra,
});
const meal = (id: string, date: string, slot: Slot = 'lunch', extra: Partial<CalendarEntry> = {}): CalendarEntry => ({
  id, date, slot, label: 'Chili', eaten: false, nutrition: { kcal: 600, protein: 40, carbs: 0, fat: 0 },
  source: { kind: 'dish', recipeId: 'chili', portions: 1 }, ...extra,
});
let n = 0;
const id = () => `new${n++}`;

// Sam's routine: cook Sunday 8 Nov, eat Monday–Friday.
const sun = '2026-11-08';
const weekdays = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];

describe('repeat a week', () => {
  it('copies meals and the cook day to the next weeks, each week fed by its own cook day', () => {
    const entries = weekdays.map((d, i) => meal(`m${i}`, d, 'lunch', i === 0 ? { eaten: true, source: { kind: 'dish', recipeId: 'chili', portions: 1, batchId: 'b1' } } : {}));
    const batches = [batch('b1', sun, { status: 'cooked', fridge: 4, freezer: 0, cookedWeightG: 2000 })];
    const r = repeatWeek(entries, batches, sun, 3, id, 'now');
    expect(r.entries).toHaveLength(15);
    expect(r.batches.map((b) => b.cookDate)).toEqual(['2026-11-15', '2026-11-22', '2026-11-29']);
    expect(r.batches.every((b) => b.status === 'planned' && b.fridge === 0 && b.cookedWeightG === undefined)).toBe(true);
    expect(r.entries.every((e) => !e.eaten && e.source.kind === 'dish' && !e.source.batchId)).toBe(true);
    const cov = coverage([...entries, ...r.entries], [...batches, ...r.batches]);
    expect(cov.uncovered).toHaveLength(0);
    expect(cov.frozen.size).toBe(4); // each Friday is 5 days after its Sunday: freezer
    expect(cov.feeds.get(r.entries[0].id)).toBe(r.batches[0].id);
  });

  it('leaves filled slots and existing cook days alone', () => {
    const entries = [meal('a', '2026-11-09'), meal('b', '2026-11-09', 'snack'), meal('c', '2026-11-09', 'snack'), meal('x', '2026-11-16', 'lunch')];
    const batches = [batch('b1', sun), batch('b2', '2026-11-17')];
    const r = repeatWeek(entries, batches, sun, 1, id);
    expect(r.skippedSlots).toBe(1); // Mon 16 lunch already planned
    expect(r.entries.map((e) => `${e.date} ${e.slot}`)).toEqual(['2026-11-16 snack', '2026-11-16 snack']);
    expect(r.skippedCooks).toBe(1); // chili already cooks on Tue 17
    expect(r.batches).toHaveLength(0);
  });

  it('turns old pinned meals into recipe meals', () => {
    const e = meal('p', '2026-11-09', 'dinner', { source: { kind: 'batch', batchId: 'b1', portions: 1.5, starch: { recipeId: 'rice', cups: 1 } } });
    const r = repeatWeek([e], [batch('b1', sun)], sun, 1, id);
    expect(r.entries[0].source).toEqual({ kind: 'dish', recipeId: 'chili', portions: 1.5, starch: { recipeId: 'rice', cups: 1 } });
  });

  it('starts on the cook day before the week shown, else Monday', () => {
    expect(repeatStart('2026-11-09', [batch('b1', sun)])).toBe(sun);
    expect(repeatStart('2026-11-09', [batch('b1', '2026-11-15')])).toBe('2026-11-09'); // Sunday at the end: next week's
    expect(repeatStart('2026-11-09', [])).toBe('2026-11-09');
  });
});
