import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CustomFood, Recipe, RecipeItem } from './model';
import { buildMeals, type MealContext } from './past-meals';
import { matchFoods, parseImportFile, toCustomFood } from './import-file';
import { buildIndex } from './search';
import { unpack, type UsdaFile } from './usda';
import { coverage } from './cookdays';
import type { Food } from './usda';

const item = (id: string, amount: number, unit: string, gramsPerUnit: number, kcal = 100, protein = 10): RecipeItem => ({
  id, name: id, food: { kind: 'none' }, per100g: { kcal, protein, carbs: 0, fat: 0 }, amount, unit, gramsPerUnit, scaling: 'scale',
});
const sausage: Recipe = { id: 'saus', name: 'Grilled Sausage & Black Beans', kind: 'dish', servings: 4, mainItemId: 'c', serveWith: 'White rice',
  items: [item('c', 2, 'lb', 453.6, 120, 22)], createdAt: '', updatedAt: '' };
const quesadilla: Recipe = { ...sausage, id: 'ques', name: 'Chicken & Cheddar Quesadillas', servings: 5, serveWith: undefined };
const rice: Recipe = { id: 'rice', name: 'White rice', kind: 'starch', yieldAmount: 4.5, yieldUnit: 'cup cooked', mainItemId: 'r',
  items: [item('r', 1.5, 'cup', 180, 360, 7)], createdAt: '', updatedAt: '' };
const shake: CustomFood = { id: 'shake', name: 'Morning shake', perServing: { kcal: 719, protein: 31, carbs: 127, fat: 9 }, servingLabel: '1 shake', servingGrams: 177 };
const banana: Food = { id: 9040, name: 'Bananas, raw', group: 'Fruits and Fruit Juices', source: 'sr' as Food['source'],
  per100g: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3 }, portions: [{ label: '1 medium (7" to 7-7/8" long)', grams: 118 }] };

let n = 0;
const ctx = (over: Partial<MealContext> = {}): MealContext => ({
  recipes: [sausage, quesadilla, rice], customFoods: [shake], entries: [], batches: [], proteinPerMeal: 40, mealKcalAim: 700,
  usdaFor: (name) => (/banana/i.test(name) ? banana : undefined), today: '2026-11-07', newId: () => `id${n++}`, now: '', ...over,
});

describe('meals in an import file', () => {
  it('a past week of lunches comes in eaten, with its side, pinned to a cooked Sunday batch of 5', () => {
    const r = buildMeals([{ from: '2026-11-02', to: '2026-11-06', slot: 'lunch', dish: 'grilled sausage & black beans' }], ctx());
    expect(r.entries.map((e) => e.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(r.entries.every((e) => e.eaten && e.slot === 'lunch')).toBe(true);
    expect(r.batches).toHaveLength(1);
    const b = r.batches[0];
    expect(b).toMatchObject({ recipeId: 'saus', cookDate: '2026-11-01', status: 'cooked', portions: 5 });
    expect(b.auto).toBeUndefined();
    expect(r.entries[0].source).toMatchObject({ kind: 'dish', recipeId: 'saus', portions: 1, batchId: b.id, starch: { recipeId: 'rice' } });
    expect(r.entries[0].label).toMatch(/rice/);
    // Nothing shows as short or missing a cook day.
    const cov = coverage(r.entries, r.batches);
    expect(cov.short.size).toBe(0);
    expect(cov.uncovered).toEqual([]);
  });

  it('days from today on are planned, not eaten, and not pinned to a batch', () => {
    const r = buildMeals([{ from: '2026-11-06', to: '2026-11-09', slot: 'dinner', dish: 'Chicken & Cheddar Quesadillas' }], ctx());
    expect(r.entries.map((e) => [e.date, e.eaten])).toEqual([
      ['2026-11-06', true], ['2026-11-07', false], ['2026-11-08', false], ['2026-11-09', false],
    ]);
    // Fri's eaten one from a cooked Nov 1 pot; Mon Nov 9 from the planned Sunday cook day before it.
    expect(r.batches.map((b) => [b.cookDate, b.portions, b.status])).toEqual([['2026-11-01', 1, 'cooked'], ['2026-11-08', 1, 'planned']]);
    expect(r.entries[3].source).not.toHaveProperty('batchId');
  });

  it("a planned week gets its Sunday cook day, sized to the week, like the weeks planner's", () => {
    const r = buildMeals([{ from: '2026-11-09', to: '2026-11-13', slot: 'dinner', dish: 'Chicken & Cheddar Quesadillas' }], ctx());
    expect(r.entries.every((e) => !e.eaten)).toBe(true);
    expect(r.batches.map((b) => [b.recipeId, b.cookDate, b.portions, b.status, b.auto])).toEqual([['ques', '2026-11-08', 5, 'planned', true]]);
    const cov = coverage(r.entries, r.batches);
    expect(cov.uncovered).toEqual([]);
    expect(cov.short.size).toBe(0);
  });

  it('an extra cook day (a pot for the freezer) is planned, not auto, and not added twice', () => {
    const cooks = [{ date: '2026-11-08', dish: 'Grilled Sausage & Black Beans', servings: 5 }];
    const r = buildMeals([], ctx(), cooks);
    expect(r.batches.map((b) => [b.recipeId, b.cookDate, b.portions, b.status, b.auto])).toEqual([['saus', '2026-11-08', 5, 'planned', undefined]]);
    const again = buildMeals([], ctx({ batches: r.batches }), cooks);
    expect(again.batches).toEqual([]);
    expect(buildMeals([], ctx(), [{ date: '2026-11-08', dish: 'Lasagna', servings: 5 }]).problems).toHaveLength(1);
  });

  it('breakfast foods: a My food by its serving, and a USDA food by "medium"', () => {
    const r = buildMeals([
      { from: '2026-11-02', to: '2026-11-03', slot: 'breakfast', food: 'Morning shake' },
      { from: '2026-11-02', to: '2026-11-03', slot: 'breakfast', food: 'Banana', amount: 1, unit: 'medium' },
    ], ctx());
    expect(r.problems).toEqual([]);
    expect(r.entries).toHaveLength(4);
    const [s, , b] = r.entries;
    expect(s).toMatchObject({ label: 'Morning shake', nutrition: { kcal: 719 }, source: { kind: 'food', food: { kind: 'custom', id: 'shake' } } });
    expect(b.label).toBe('Banana (1 medium)');
    expect(b.nutrition.kcal).toBeCloseTo(105, 0);
    expect(b.source).toMatchObject({ kind: 'food', food: { kind: 'usda', id: 9040 } });
  });

  it("importing twice adds nothing the second time, and uses a cook day that's already there", () => {
    const meals = [{ from: '2026-11-02', to: '2026-11-06', slot: 'lunch' as const, dish: 'Grilled Sausage & Black Beans' }];
    const first = buildMeals(meals, ctx());
    const again = buildMeals(meals, ctx({ entries: first.entries, batches: first.batches }));
    expect(again.entries).toEqual([]);
    expect(again.batches).toEqual([]);
    expect(again.already).toBe(5);
  });

  it('says what it could not use', () => {
    const r = buildMeals([
      { from: '2026-11-02', slot: 'lunch', dish: 'Lasagna' },
      { from: '2026-11-02', slot: 'snack', food: 'Dragonfruit' },
    ], ctx());
    expect(r.entries).toEqual([]);
    expect(r.problems).toHaveLength(2);
  });

  it('the file checks dates, slots and dish-or-food', () => {
    const f = (m: object) => JSON.stringify({ format: 'meal-prep-planner/1', meals: [m] });
    expect(() => parseImportFile(f({ from: 'Nov 2', slot: 'lunch', dish: 'x' }))).toThrow(/dates/);
    expect(() => parseImportFile(f({ from: '2026-11-02', slot: 'brunch', dish: 'x' }))).toThrow(/slot/);
    expect(() => parseImportFile(f({ from: '2026-11-02', slot: 'lunch' }))).toThrow(/dish or a food/);
    expect(parseImportFile(f({ from: '2026-11-02', slot: 'lunch', dish: 'x' })).meals).toHaveLength(1);
  });

  it("this week's file reads, and its dishes are in meals.json", () => {
    const file = parseImportFile(readFileSync('data/this-week.json', 'utf8'));
    const names = new Set(parseImportFile(readFileSync('data/meals.json', 'utf8')).recipes.map((r) => r.name));
    for (const m of file.meals) if (m.dish) expect(names).toContain(m.dish);
    for (const k of file.cooks) expect(names).toContain(k.dish);
  });

  it("Sam's past-meals file reads, and every dish in it is in meals.json", () => {
    const file = parseImportFile(readFileSync('data/past-meals.json', 'utf8'));
    const names = new Set(parseImportFile(readFileSync('data/meals.json', 'utf8')).recipes.map((r) => r.name));
    for (const m of file.meals) if (m.dish) expect(names).toContain(m.dish);
    expect(file.meals.length).toBeGreaterThan(0);
  });

  it("Sam's file against the real USDA list and his foods: every line is used, banana ~105 kcal", () => {
    const usda = unpack(JSON.parse(readFileSync('public/data/usda-foods.json', 'utf8')) as UsdaFile);
    const index = buildIndex(usda);
    const byId = new Map(usda.map((f) => [f.id, f]));
    const book = parseImportFile(readFileSync('data/meals.json', 'utf8'));
    const recipes: Recipe[] = book.recipes.map((r, i) => ({ id: `r${i}`, name: r.name, kind: r.kind, servings: r.servings ?? undefined,
      serveWith: r.serve_with ?? undefined, items: [item('x', 2, 'lb', 453.6, 150, 20)], createdAt: '', updatedAt: '',
      ...(r.kind === 'starch' ? { yieldAmount: 4, yieldUnit: 'cup cooked' } : {}) }));
    const file = parseImportFile(readFileSync('data/past-meals.json', 'utf8'));
    const r = buildMeals(file.meals, ctx({ recipes, customFoods: book.foods.map((f) => toCustomFood(f)),
      usdaFor: (name) => matchFoods(name, index, byId, 1)[0] }));
    expect(r.problems).toEqual([]);
    expect(r.entries).toHaveLength(60); // 3 weeks × 5 days × (shake, banana, lunch, dinner)
    expect(r.batches).toHaveLength(6);
    expect(r.entries.find((e) => e.label.startsWith('Banana'))!.nutrition.kcal).toBeCloseTo(105, -1);
  });
});
