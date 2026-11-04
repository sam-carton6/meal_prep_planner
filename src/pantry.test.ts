import { describe, expect, it } from 'vitest';
import type { Recipe, RecipeItem } from './model';
import { addPantry, pantryKeys, pantrySuggestions, removePantry, setLow } from './pantry';
import { shopWeek } from './plan';

const it_ = (id: string, name: string, unit: string, extra: Partial<RecipeItem> = {}): RecipeItem => ({
  id, name, food: { kind: 'usda', id: Number(id.replace(/\D/g, '')) || 1 }, per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  amount: 1, unit, gramsPerUnit: 1, scaling: 'scale', ...extra,
});
const chili: Recipe = {
  id: 'c', name: 'Chili', kind: 'dish', createdAt: '', updatedAt: '', mainItemId: 'i1',
  items: [it_('i1', 'Ground beef', 'lb', { group: 'Beef Products' }), it_('i2', 'Chili powder', 'tbsp'), it_('i3', 'Salt', 'to taste', { amount: null }),
    it_('i4', 'Olive oil', 'cup', { group: 'Fats and Oils' })],
};
const rice: Recipe = { id: 'r', name: 'White rice', kind: 'starch', createdAt: '', updatedAt: '', mainItemId: 'i5', items: [it_('i5', 'Rice, dry', 'cup')] };

describe('pantry', () => {
  it('adds by name once, keeps keys, and counts old staples', () => {
    let list = addPantry([], ' soy  sauce ', 'a');
    list = addPantry(list, 'Soy sauce', 'b');
    list = addPantry(list, 'Chili powder', 'c', 'usda:2');
    expect(list.map((p) => p.name)).toEqual(['Chili powder', 'soy sauce']);
    expect(pantryKeys({ pantry: list, pantryStaples: ['usda:9', 'usda:2'] }).sort()).toEqual(['usda:2', 'usda:9']);
    const after = removePantry({ pantry: list, pantryStaples: ['usda:2'] }, 'c');
    expect(after).toEqual({ pantry: [list[1]], pantryStaples: [] });
    expect(setLow(list, 'a', true).find((p) => p.id === 'a')?.low).toBe(true);
  });

  it('suggests spices, oils, to-taste lines and dry starch from recipes, not meat', () => {
    const names = pantrySuggestions([chili, rice], { pantryStaples: [] }).map((s) => s.name);
    expect(names).toEqual(['Chili powder', 'Olive oil', 'Rice, dry', 'Salt']);
    const fewer = pantrySuggestions([chili, rice], { pantry: [{ id: 'x', name: 'salt' }], pantryStaples: ['usda:5'] }).map((s) => s.name);
    expect(fewer).toEqual(['Chili powder', 'Olive oil']);
  });

  it('shopping weeks start on the shopping day', () => {
    expect(shopWeek('2026-11-07')).toEqual(['2026-11-07', '2026-11-13']); // Saturday
    expect(shopWeek('2026-11-08')).toEqual(['2026-11-07', '2026-11-13']); // Sunday cook day is in it
    expect(shopWeek('2026-11-13')).toEqual(['2026-11-07', '2026-11-13']);
    expect(shopWeek('2026-11-08', 0)).toEqual(['2026-11-08', '2026-11-14']);
  });
});
