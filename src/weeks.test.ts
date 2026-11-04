import { describe, expect, it } from 'vitest';
import type { Batch, CalendarEntry, Recipe, RecipeItem } from './model';
import { choiceDraft, defaultChoice, setRow, sizedBatch, stockDraft, syncCookDay, weekNeeds, weekRow, type Choice } from './weeks';
import { coverage } from './cookdays';

const item = (id: string, amount: number, unit: string, gramsPerUnit: number, kcal = 100, protein = 10): RecipeItem => ({
  id, name: id, food: { kind: 'none' }, per100g: { kcal, protein, carbs: 0, fat: 0 }, amount, unit, gramsPerUnit, scaling: 'scale',
});
// 8 servings from 3.2 lb chicken + 2 cans of beans.
const chicken: Recipe = { id: 'mex', name: 'Mexican chicken', kind: 'dish', servings: 8, mainItemId: 'c', serveWith: 'white rice',
  items: [item('c', 3.2, 'lb', 453.6, 120, 22), item('beans', 2, 'can (15 oz)', 425, 90, 6)], createdAt: '', updatedAt: '' };
const taco: Recipe = { ...chicken, id: 'taco', name: 'Taco beef', servings: 5, serveWith: undefined };
const chili: Recipe = { ...chicken, id: 'chili', name: 'Chili', servings: 8, serveWith: undefined };
const rice: Recipe = { id: 'rice', name: 'White rice', kind: 'starch', yieldAmount: 4.5, yieldUnit: 'cup cooked', mainItemId: 'r',
  items: [item('r', 1.5, 'cup', 180, 360, 7)], createdAt: '', updatedAt: '' };
const recipes = [chicken, taco, chili, rice];
const mon = '2026-11-09';
const sun = '2026-11-08';
const each = { kcal: 330, protein: 40, carbs: 0, fat: 0 };
let n = 0;
const id = () => `id${n++}`;
const byId = (rid?: string) => recipes.find((r) => r.id === rid);
const draft = (c: Choice) => choiceDraft(c, byId(c.recipeId)!, byId(c.starch?.recipeId), each);
const apply = (entries: CalendarEntry[], ch: { add: CalendarEntry[]; remove: string[] }) =>
  [...entries.filter((e) => !ch.remove.includes(e.id)), ...ch.add];
const plan = (entries: CalendarEntry[], slot: 'lunch' | 'dinner', c: Choice | null) =>
  apply(entries, setRow(entries, mon, slot, c, draft, id));

describe('weeks planner', () => {
  it('picks the usual side, sized to the calorie aim (rice 216 kcal a cup: 1.94 → 2 cups)', () => {
    expect(defaultChoice(chicken, recipes, each, 750)).toEqual({ recipeId: 'mex', portions: 1, starch: { recipeId: 'rice', cups: 2 } });
    expect(defaultChoice(taco, recipes, each, 750)).toEqual({ recipeId: 'taco', portions: 1 });
  });

  it('fills Monday–Friday from one pick and reads the row back', () => {
    const entries = plan([], 'lunch', defaultChoice(chicken, recipes, each, 750));
    expect(entries.map((e) => e.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(entries[0].label).toBe('Mexican chicken + 2 cup white rice');
    const row = weekRow(entries, mon, 'lunch');
    expect(row.main).toEqual({ recipeId: 'mex', portions: 1, starch: { recipeId: 'rice', cups: 2 } });
    expect(row.days.every((d) => d.kind === 'main')).toBe(true);
  });

  it('keeps swapped days (another dish, freezer, takeout) when the row changes', () => {
    let entries = plan([], 'dinner', { recipeId: 'mex', portions: 1 });
    const thu = entries.find((e) => e.date === '2026-11-12')!;
    const fri = entries.find((e) => e.date === '2026-11-13')!;
    entries = entries.filter((e) => e !== thu && e !== fri);
    entries.push({ ...thu, id: 'thu', ...draft({ recipeId: 'chili', portions: 1 }) });
    entries.push({ ...fri, id: 'fri', label: 'Pizza', nutrition: each, source: { kind: 'quick' } });
    const row = weekRow(entries, mon, 'dinner');
    expect(row.main?.recipeId).toBe('mex');
    expect(row.days.map((d) => d.kind)).toEqual(['main', 'main', 'main', 'other', 'other']);
    entries = plan(entries, 'dinner', { recipeId: 'taco', portions: 1.5 });
    expect(entries.map((e) => e.label).sort()).toEqual(['Chili', 'Pizza', 'Taco beef ×1½', 'Taco beef ×1½', 'Taco beef ×1½']);
    entries = plan(entries, 'dinner', null);
    expect(entries.map((e) => e.label).sort()).toEqual(['Chili', 'Pizza']);
  });

  it('keeps the side as the amount in the container when servings change', () => {
    const entries = plan([], 'lunch', { recipeId: 'mex', portions: 1.5, starch: { recipeId: 'rice', cups: 1.5 } });
    expect(entries[0].source).toEqual({ kind: 'dish', recipeId: 'mex', portions: 1.5, starch: { recipeId: 'rice', cups: 1 } });
    expect(entries[0].label).toBe('Mexican chicken ×1½ + 1½ cup white rice');
    expect(weekRow(entries, mon, 'lunch').main?.starch?.cups).toBe(1.5);
  });

  it('leaves eaten days alone', () => {
    let entries = plan([], 'lunch', { recipeId: 'mex', portions: 1 });
    entries[0] = { ...entries[0], eaten: true };
    entries = plan(entries, 'lunch', { recipeId: 'taco', portions: 1 });
    expect(entries.filter((e) => e.label === 'Mexican chicken')).toHaveLength(1);
  });

  it('sizes the Sunday cook day to the fresh meals: piecewise weeks too, freezer meals not counted', () => {
    let entries = plan([], 'lunch', { recipeId: 'mex', portions: 1 });
    entries = plan(entries, 'dinner', { recipeId: 'taco', portions: 1.5 });
    // Thu dinner: chili cooked fresh too; Fri dinner: a chili container from the freezer.
    const thu = entries.find((e) => e.date === '2026-11-12' && e.slot === 'dinner')!;
    const fri = entries.find((e) => e.date === '2026-11-13' && e.slot === 'dinner')!;
    const frozen: Batch = { ...sizedBatch(chili, 8, '2026-10-25', 40, 'old', ''), status: 'cooked', fridge: 0, freezer: 3, auto: false };
    entries = entries.map((e) => (e === thu ? { ...e, ...draft({ recipeId: 'chili', portions: 1 }) } : e === fri ? { ...e, ...stockDraft(frozen, chili, each) } : e));
    expect(Object.fromEntries(weekNeeds(entries, mon, [frozen]))).toEqual({ mex: 5, taco: 4.5, chili: 1 });

    const ch = syncCookDay(mon, entries, [frozen], recipes, 40, id, 'now');
    expect(ch.add.map((b) => [b.recipeName, b.cookDate, b.portions])).toEqual([
      ['Mexican chicken', sun, 5], ['Taco beef', sun, 4.5], ['Chili', sun, 1],
    ]);
    const mex = ch.add[0];
    expect(mex.items[0].amount).toBeCloseTo(2); // 3.2 lb × 5/8
    expect(mex.items[1].amount).toBeCloseTo(1.25); // exact: the shopping list rounds cans up
    const one = ch.add[2]; // 1 serving of chili: an eighth of everything, not whole cans
    expect(one.items[1].amount).toBeCloseTo(0.25);
    expect(mex.auto).toBe(true);

    const cov = coverage(entries, [frozen, ...ch.add]);
    expect(cov.feeds.get(fri.id)).toBe('old'); // the freezer container comes from the old batch
    expect(cov.uncovered).toHaveLength(0);
    expect(cov.short.size).toBe(0);
  });

  it('keeps auto cook days in step, and never touches edited or cooked ones', () => {
    let entries = plan([], 'lunch', { recipeId: 'mex', portions: 1 });
    let batches = syncCookDay(mon, entries, [], recipes, 40, id).add;
    entries = plan(entries, 'lunch', { recipeId: 'mex', portions: 1.5 });
    const up = syncCookDay(mon, entries, batches, recipes, 40, id);
    expect(up.update.map((b) => [b.id, b.portions])).toEqual([[batches[0].id, 7.5]]);
    entries = plan(entries, 'lunch', { recipeId: 'taco', portions: 1 });
    const swap = syncCookDay(mon, entries, batches, recipes, 40, id);
    expect(swap.remove).toEqual([batches[0].id]);
    expect(swap.add.map((b) => b.recipeId)).toEqual(['taco']);

    batches = [{ ...batches[0], auto: false }];
    entries = plan(entries, 'lunch', { recipeId: 'mex', portions: 2 });
    const edited = syncCookDay(mon, entries, batches, recipes, 40, id);
    expect(edited).toEqual({ add: [], update: [], remove: [] }); // he entered what he bought: his amounts stay
  });
});
