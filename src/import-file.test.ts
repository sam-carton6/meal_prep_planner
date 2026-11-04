import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { learnedFrom, matchFoods, parseImportFile, recipePreview, rematch, reviewRecipe, toCustomFood, toRecipe } from './import-file';
import { buildIndex } from './search';
import { unpack, type UsdaFile } from './usda';

// The example from RECIPE-IMPORT.md, as claude.ai would send it (in a code block, with chat around it).
const doc = readFileSync('RECIPE-IMPORT.md', 'utf8');
const example = doc.slice(doc.indexOf('{\n  "format"'), doc.indexOf('\nRules:'));
const reply = `Here's your file:\n\n\`\`\`json\n${example}\n\`\`\`\n\nGuesses: none.`;

const foods = unpack(JSON.parse(readFileSync('public/data/usda-foods.json', 'utf8')) as UsdaFile);
const index = buildIndex(foods);
const byId = new Map(foods.map((f) => [f.id, f]));

describe('reading an import file', () => {
  it('reads JSON out of a pasted claude.ai reply', () => {
    const f = parseImportFile(reply);
    expect(f.recipes.map((r) => r.name)).toEqual(['Sweet Potato Beef Chili', 'White rice']);
    expect(f.foods.map((x) => x.name)).toEqual(['Naked Mass, chocolate', 'Chicken burrito bowl']);
  });

  it('explains what is wrong in plain words', () => {
    expect(() => parseImportFile('hello')).toThrow(/Couldn't find any JSON/);
    expect(() => parseImportFile('{"format": "meal-prep-planner/1", "recipes": [}')).toThrow(/typo/);
    expect(() => parseImportFile('{"format": "other/2", "recipes": []}')).toThrow(/other\/2/);
    expect(() => parseImportFile('{"recipes": [], "foods": []}')).toThrow(/No recipes or foods/);
  });
});

describe('matching ingredients to USDA', () => {
  const top = (name: string) => matchFoods(name, index, byId)[0]?.name;

  it('uses Sam\'s known names first, then the search', () => {
    expect(matchFoods('Ground beef 85/15, raw', index, byId)[0].id).toBe(171796);
    expect(top('Sweet potatoes, raw')).toMatch(/^Sweet potato/i);
    expect(top('Onion, raw')).toBe('Onions, raw');
    expect(top('Chili powder')).toBe('Spices, chili powder');
  });

  it('builds the chili with drained beans, sizes from USDA, and a note line for seasonings', () => {
    const f = parseImportFile(reply);
    const rv = reviewRecipe(f.recipes[0], index, byId, foods);
    const line = (n: string) => rv.lines.find((l) => l.ing.name.startsWith(n))!;
    expect(line('Kidney beans').item.drained).toBe(true);
    expect(line('Onion').item.gramsPerUnit).toBeGreaterThan(90); // USDA medium onion, 110 g
    expect(line('Seasonings').item.amount).toBeNull();
    expect(line('Cheddar').item.optional).toBe(true);
    const recipe = toRecipe(rv, '2026-11-04T00:00:00Z');
    expect(recipe.items.find((i) => i.id === recipe.mainItemId)!.name).toBe('Ground beef 85/15, raw');
    expect(recipe.notes).toMatch(/makes 8 servings/);
    const p = recipePreview(rv, 40);
    // 3 lb 85/15 beef alone is ~3,400 kcal and ~240 g protein: the whole pot is in that range and up.
    expect(p.total.kcal).toBeGreaterThan(3500);
    expect(p.containers).toBeGreaterThanOrEqual(6);
  });

  it('makes the rice a starch with its yield, and lets a line be matched to something else', () => {
    const f = parseImportFile(reply);
    const rv = reviewRecipe(f.recipes[1], index, byId, foods);
    const r = toRecipe(rv, 'now');
    expect(r.kind).toBe('starch');
    expect(r.yieldAmount).toBe(12);
    const brown = foods.find((x) => /^Rice, brown, long-grain, raw/i.test(x.name))!;
    const changed = rematch(rv.lines[0], brown, foods);
    expect(changed.item.food).toEqual({ kind: 'usda', id: brown.id });
    expect(changed.item.amount).toBe(4);
    expect(changed.item.gramsPerUnit).toBeGreaterThan(150); // a cup of dry rice
  });

  it('remembers a match Sam changed, for the next import', () => {
    const f = parseImportFile(reply);
    const rv = reviewRecipe(f.recipes[1], index, byId, foods);
    const brown = foods.find((x) => /^Rice, brown, long-grain, raw/i.test(x.name))!;
    const fixed = { ...rv, lines: [rematch(rv.lines[0], brown, foods)] };
    const learned = learnedFrom([fixed]);
    expect(learned).toEqual({ 'rice, white, long grain, dry': brown.id });
    expect(reviewRecipe(f.recipes[1], index, byId, foods, learned).lines[0].item.food).toEqual({ kind: 'usda', id: brown.id });
  });

  it('keeps an existing recipe\'s id when replacing it', () => {
    const f = parseImportFile(reply);
    const r = toRecipe(reviewRecipe(f.recipes[1], index, byId, foods), 'now', { id: 'old', createdAt: 'then' });
    expect([r.id, r.createdAt, r.updatedAt]).toEqual(['old', 'then', 'now']);
  });
});

describe('foods', () => {
  it('turns label foods into My foods with their extra units', () => {
    const f = parseImportFile(reply);
    const nm = toCustomFood(f.foods[0]);
    expect(nm).toMatchObject({ name: 'Naked Mass, chocolate', brand: 'Naked Nutrition', servingGrams: 333, units: [{ unit: 'scoop', grams: 55 }] });
    expect(nm.perServing).toEqual({ kcal: 1360, protein: 50, carbs: 251, fat: 15 });
    expect(toCustomFood(f.foods[1])).toMatchObject({ place: 'Chipotle', servingLabel: '1 bowl' });
    expect(toCustomFood(f.foods[1]).units).toBeUndefined();
  });
});

describe('the short label prompt in RECIPE-IMPORT.md', () => {
  it('has an example the app reads (foods only, no recipes)', () => {
    const start = doc.indexOf('{\n  "format"', doc.indexOf('## Short prompt'));
    const example = doc.slice(start, doc.indexOf('\nRules:', start));
    const f = parseImportFile(`\`\`\`json\n${example}\n\`\`\``);
    expect(f.recipes).toEqual([]);
    expect(toCustomFood(f.foods[0])).toMatchObject({ name: 'Greek yogurt, plain, nonfat', brand: 'Fage', servingGrams: 170,
      perServing: { kcal: 90, protein: 18, carbs: 5, fat: 0 } });
  });
});
