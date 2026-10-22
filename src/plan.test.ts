import { describe, expect, it } from 'vitest';
import type { Batch, CalendarEntry, RecipeItem } from './model';
import { addDays, addMonths, groceryList, monthWeeks, portionsUsed, weekAverage, weekStart } from './plan';
import { G_PER } from './units';

const ids = new Map<string, number>();
const idOf = (name: string) => ids.get(name) ?? ids.set(name, ids.size + 1).get(name)!;
const it_ = (name: string, amount: number, unit: string, gramsPerUnit: number, group = '', id = name): RecipeItem => ({
  id, name, food: { kind: 'usda', id: idOf(name) }, per100g: { kcal: 100, protein: 10, carbs: 0, fat: 0 },
  amount, unit, gramsPerUnit, scaling: 'scale', group,
});

const batch = (recipeName: string, items: RecipeItem[]): Batch => ({
  id: recipeName, recipeId: recipeName, recipeName, status: 'planned', cookDate: '2026-11-01', items,
  portions: 8, fridge: 0, freezer: 0, createdAt: '',
});

describe('dates', () => {
  it('finds the Monday of a week and adds days across months', () => {
    expect(weekStart('2026-10-22')).toBe('2026-10-19'); // Thursday → Monday
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('builds a Monday-first month grid', () => {
    const oct = monthWeeks('2026-10-21'); // Oct 1, 2026 is a Thursday
    expect(oct[0][0]).toBe('2026-09-28');
    expect(oct.at(-1)!.at(-1)).toBe('2026-11-01');
    expect(oct).toHaveLength(5);
    expect(monthWeeks('2027-02-10')).toHaveLength(4); // Feb 2027 starts on a Monday
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
  });
});

describe('grocery list', () => {
  const chicken = batch('Chicken', [
    it_('Diced tomatoes, canned', 1, 'can (14 oz)', 397),
    it_('Onions, raw', 1, 'medium', 110, 'Vegetables and Vegetable Products'),
    it_('Chicken thigh', 3.15, 'lb', G_PER.lb, 'Poultry Products'),
  ]);
  const chili = batch('Chili', [
    it_('Diced tomatoes, canned', 1, 'can (14 oz)', 397),
    it_('Onions, raw', 4, 'oz', G_PER.oz, 'Vegetables and Vegetable Products'),
    it_('Ground beef', 3, 'lb', G_PER.lb, 'Beef Products'),
  ]);

  it('adds up the same food across recipes', () => {
    const list = groceryList([chicken, chili]);
    const line = (n: string) => list.find((l) => l.name === n)!;
    expect(line('Diced tomatoes, canned').amountText).toBe('2 can (14 oz)');
    expect(line('Diced tomatoes, canned').forRecipes).toEqual(['Chicken', 'Chili']);
    expect(line('Onions, raw').amountText).toBe('7.9 oz'); // 1 medium (110 g) + 4 oz → by weight
    expect(line('Ground beef').amountText).toBe('3 lb');
  });

  it('groups by aisle and marks pantry staples', () => {
    const list = groceryList([chicken], [`usda:${idOf('Diced tomatoes, canned')}`]);
    expect(list.map((l) => l.aisle)).toEqual(['Produce', 'Meat & seafood', 'Canned & jarred']);
    expect(list.find((l) => l.name === 'Diced tomatoes, canned')!.staple).toBe(true);
  });
});

describe('calendar', () => {
  const e = (date: string, kcal: number, batchId?: string): CalendarEntry => ({
    id: date + kcal, date, slot: 'dinner', label: '', eaten: false,
    nutrition: { kcal, protein: 40, carbs: 0, fat: 0 },
    source: batchId ? { kind: 'batch', batchId, portions: 1 } : { kind: 'quick' },
  });

  it('averages over the days that have something on them', () => {
    const w = weekAverage([e('2026-10-19', 2000), e('2026-10-19', 500), e('2026-10-20', 3500)]);
    expect(w.days).toBe(2);
    expect(w.perDay.kcal).toBe(3000);
  });

  it('counts portions of a batch already planned', () => {
    expect(portionsUsed('chili', [e('2026-10-19', 600, 'chili'), e('2026-10-20', 600, 'chili'), e('2026-10-20', 1)])).toBe(2);
  });
});
