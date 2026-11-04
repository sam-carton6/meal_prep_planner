import { describe, expect, it } from 'vitest';
import type { Batch, CalendarEntry, Recipe, RecipeItem } from './model';
import { coverage } from './cookdays';
import { prepDates, prepSheet } from './prep';

const item = (grams: number, kcal: number, protein: number): RecipeItem => ({
  id: 'i', name: 'x', food: { kind: 'none' }, per100g: { kcal, protein, carbs: 0, fat: 0 },
  amount: grams, unit: 'g', gramsPerUnit: 1, scaling: 'scale',
});
const rice: Recipe = { id: 'rice', name: 'White rice', kind: 'starch', yieldAmount: 4.5, yieldUnit: 'cup cooked', mainItemId: 'i',
  items: [{ ...item(270, 360, 7), amount: 1.5, unit: 'cup', gramsPerUnit: 180 }], createdAt: '', updatedAt: '' };
const chicken: Recipe = { id: 'mex', name: 'Mexican chicken', kind: 'dish', items: [item(2000, 83, 10)], createdAt: '', updatedAt: '' };
// 2000 g at 83 kcal/100 g = 1660 kcal, 200 g protein; 5 containers → 332 kcal, 40 g each.
const batch: Batch = { id: 'b', recipeId: 'mex', recipeName: 'Mexican chicken', status: 'planned', cookDate: '2026-11-08',
  items: chicken.items, portions: 6, cookedWeightG: 1800, fridge: 0, freezer: 0, createdAt: '' };
let n = 0;
const meal = (date: string, cups = 1.75, portions = 1): CalendarEntry => ({
  id: `m${n++}`, date, slot: 'lunch', label: '', eaten: false, nutrition: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  source: { kind: 'dish', recipeId: 'mex', portions, ...(cups ? { starch: { recipeId: 'rice', cups } } : {}) },
});

describe('prep sheet', () => {
  const entries = [meal('2026-11-09'), meal('2026-11-10'), meal('2026-11-11'), meal('2026-11-12', 0), meal('2026-11-14', 1, 1.5)];
  const sheet = prepSheet('2026-11-08', [batch], [chicken, rice], coverage(entries, [batch]));

  it('groups containers by what goes in them, with grams and numbers per container', () => {
    const d = sheet.dishes[0];
    expect(d.groups.map((g) => [g.count, g.portions, g.cups])).toEqual([[3, 1, 1.75], [1, 1, 0], [1, 1.5, 1.5]]);
    expect(d.gramsEach).toBe(300); // 1800 g over 6 containers
    expect(d.groups[2].grams).toBe(450);
    // 1¾ cup rice = 1.75 × (1.5 cup × 180 g × 3.6 kcal/g ÷ 4.5) = 378 kcal on top of 276.7
    expect(Math.round(d.groups[0].each.kcal)).toBe(Math.round(1660 / 6 + 1.75 * 216));
    expect(d.spare).toBe(0.5); // 6 made, 5.5 servings planned
  });

  it('freezes containers more than 5 days out', () => {
    const d = sheet.dishes[0];
    expect(d.groups[0].meals.every((m) => !m.frozen)).toBe(true);
    expect(d.groups[2].meals[0].frozen).toBe(true); // Saturday the 14th: 6 days
    expect([d.fridge, d.freezer]).toEqual([4, 1]);
  });

  it('adds up the rice to cook', () => {
    const s = sheet.starches[0];
    expect(s.cups).toBe(1.75 * 3 + 1.5);
    expect(s.containers).toBe(4);
    expect(s.cook[0].amount).toBeCloseTo((6.75 / 4.5) * 1.5); // dry cups
  });

  it('offers the next cook day first', () => {
    const bs = [{ ...batch, cookDate: '2026-11-01', status: 'cooked' as const }, batch, { ...batch, cookDate: '2026-11-15' }];
    expect(prepDates(bs, '2026-11-04')).toEqual(['2026-11-08', '2026-11-15']);
    expect(prepDates(bs, '2026-11-20')).toEqual(['2026-11-15', '2026-11-08']);
  });
});
