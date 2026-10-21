import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildImport, USDA_MATCH, type OldFile } from './import-recipes';
import { batchSummary, perYieldUnit } from './recipe-math';
import { unpack, type UsdaFile } from './usda';

// Uses the real files: Sam's recipes.json and the built-in USDA list.
const foods = unpack(JSON.parse(readFileSync('public/data/usda-foods.json', 'utf8')) as UsdaFile);
const file = JSON.parse(readFileSync('recipes.json', 'utf8')) as OldFile;
const result = buildImport(file, foods, '2026-10-20T00:00:00Z');

describe('import recipes.json', () => {
  it('finds every matched USDA food in the built-in list', () => {
    const ids = new Set(foods.map((f) => f.id));
    for (const [name, id] of Object.entries(USDA_MATCH)) if (id !== null) expect(ids.has(id), name).toBe(true);
  });

  it('imports both dishes, the rice, and chipotle as a My foods entry', () => {
    expect(result.recipes.map((r) => `${r.kind}:${r.name}`)).toEqual([
      'dish:Mexican Chicken & Vegetables',
      'dish:Sweet Potato Beef Chili',
      'starch:White rice, long grain',
    ]);
    expect(result.customFoods.map((c) => c.name)).toEqual(['Chipotle peppers in adobo']);
    expect(result.batches.map((b) => b.portions)).toEqual([8, 8]);
  });

  it('lands close to Sam\'s own numbers (within 10%) after recalculating from USDA', () => {
    for (const r of result.report) {
      expect(Math.abs(r.now.kcal - r.old.kcal) / r.old.kcal, r.name).toBeLessThan(0.1);
      expect(Math.abs(r.now.protein - r.old.protein) / r.old.protein, r.name).toBeLessThan(0.1);
    }
  });

  it('keeps the chili\'s cooked weight and gives a weight per container', () => {
    const chili = result.batches[1];
    expect(Math.round(batchSummary(chili).gramsEach!)).toBe(633);
  });

  it('works out rice per cooked cup from the batch', () => {
    const rice = result.recipes[2];
    expect(Math.round(perYieldUnit(rice).kcal)).toBe(225);
  });

  it('treats "to taste" as a note and the cheddar as optional', () => {
    const chicken = result.recipes[0].items;
    expect(chicken.at(-1)!.amount).toBeNull();
    expect(result.recipes[1].items.find((i) => i.name === 'Shredded cheddar')!.optional).toBe(true);
  });
});
