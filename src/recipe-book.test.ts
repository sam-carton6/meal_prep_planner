import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseImportFile } from './import-file';
import { bookData, renderRecipeBook } from './recipe-book';
import { unpack, type UsdaFile } from './usda';

const foods = unpack(JSON.parse(readFileSync('public/data/usda-foods.json', 'utf8')) as UsdaFile);
const file = parseImportFile(readFileSync('data/meals.json', 'utf8'));
const opts = { aimKcal: 750, proteinPerMeal: 40, madeOn: 'test' };

describe('recipe book (data/meals.json)', () => {
  it('uses Sam\'s container counts and adds the side toward the calorie aim', () => {
    const { recipes } = bookData(file, foods, opts);
    const get = (n: string) => recipes.find((b) => b.rv.file.name === n)!;
    expect(get('Grilled Chicken Breast').containers).toBe(5);
    const mex = get('Mexican Chicken & Vegetables');
    expect(mex.side?.name).toBe('White rice');
    expect(mex.side!.with.kcal).toBeGreaterThan(650);
    expect(mex.side!.with.kcal).toBeLessThan(850);
    expect(get('Grilled Chicken Breast').side).toMatchObject({ name: 'Big Batch Salad', amount: 1 });
    expect(get('Sweet Potato Beef Chili').side).toBeUndefined();
  });

  it('renders every recipe with no broken numbers', () => {
    const html = renderRecipeBook(file, foods, opts);
    for (const r of file.recipes) expect(html).toContain(r.name.replace(/&/g, '&amp;'));
    expect(html).not.toMatch(/NaN|undefined/);
  });
});
