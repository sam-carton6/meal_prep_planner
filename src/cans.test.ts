import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canPair, setDrained, withDrainOptions } from './cans';
import { buildImport, type OldFile } from './import-recipes';
import type { RecipeItem } from './model';
import { totals } from './recipe-math';
import { unpack, type UsdaFile } from './usda';

const foods = unpack(JSON.parse(readFileSync('public/data/usda-foods.json', 'utf8')) as UsdaFile);
const byId = (id: number) => foods.find((f) => f.id === id)!;

const can = (id: number): RecipeItem => {
  const f = byId(id);
  return { id: 'x', name: f.name, food: { kind: 'usda', id }, per100g: f.per100g, amount: 1, unit: 'can (15 oz)',
    gramsPerUnit: 425.2, scaling: 'scale' };
};

describe('whole can vs drained', () => {
  it('finds the drained version of canned beans', () => {
    expect(canPair(byId(175188), foods)?.drained.name).toMatch(/^Beans, black, .*drained/); // black turtle → black
    expect(canPair(byId(175192), foods)?.drained.name).toMatch(/^Beans, great northern, .*drained/);
    expect(canPair(byId(170393), foods)).toBeNull(); // raw carrots: not a can
  });

  it('switches nutrition and weight per can, keeping the number of cans', () => {
    const whole = withDrainOptions(can(175188), foods);
    expect(whole.drained).toBe(false);
    expect(Math.round(totals([whole]).kcal)).toBe(387); // 425 g × 91 kcal/100 g
    const drained = setDrained(whole, true);
    expect(drained.amount).toBe(1);
    expect(drained.gramsPerUnit).toBe(255); // ~60% of the can
    expect(Math.round(totals([drained]).kcal)).toBe(294); // 255 g × 115.3
    expect(setDrained(drained, false).per100g.kcal).toBe(91);
  });

  it('leaves non-can items alone', () => {
    const item = { ...can(175188), unit: 'cup' };
    expect(withDrainOptions(item, foods).drain).toBeUndefined();
  });

  it('imports the chicken recipe\'s black beans drained and the chili\'s cans whole', () => {
    const r = buildImport(JSON.parse(readFileSync('recipes.json', 'utf8')) as OldFile, foods);
    const find = (recipe: number, name: string) => r.recipes[recipe].items.find((i) => i.name === name)!;
    expect(find(0, 'Black beans, canned').drained).toBe(true);
    expect(find(1, 'Dark red kidney beans, canned').drained).toBe(false);
    expect(find(1, 'Great northern beans, canned').drain).toBeDefined();
  });
});
