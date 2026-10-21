import { describe, expect, it } from 'vitest';
import type { RecipeItem } from './model';
import {
  batchSummary,
  perYieldUnit,
  portionsForProtein,
  scaleItems,
  starchToCook,
  starchToReach,
  totals,
} from './recipe-math';
import { fmtAmount, fmtWeight, G_PER, gramsFromLabel, unitOptions } from './units';

// Build an item from "how many kcal/protein per unit" to keep the test data readable.
function item(id: string, amount: number | null, unit: string, gramsPerUnit: number, kcal100: number, protein100: number,
  extra: Partial<RecipeItem> = {}): RecipeItem {
  return {
    id, name: id, food: { kind: 'none' }, amount, unit, gramsPerUnit, scaling: 'scale',
    per100g: { kcal: kcal100, protein: protein100, carbs: 0, fat: 0 }, ...extra,
  };
}

// Sam's Mexican Chicken & Vegetables (USDA SR Legacy values).
const chicken = {
  mainItemId: 'chicken',
  items: [
    item('chicken', 3.15, 'lb', G_PER.lb, 121, 19.66),
    item('black beans', 1, 'can (15 oz)', 425, 91, 6),
    item('carrots', 5, 'medium', 61, 41, 0.93),
    item('peas', 1, 'cup', 134, 77, 5.2),
    item('seasonings', null, 'to taste', 0, 0, 0),
  ],
};

describe('scaling to the protein you bought', () => {
  it('keeps the recipe as written at its own weight', () => {
    const s = scaleItems(chicken, 3.15 * G_PER.lb);
    expect(s.map((i) => i.amount)).toEqual([3.15, 1, 5, 1, null]);
  });

  it('scales the rest to a 4 lb pack, rounding cans and carrots to whole ones and cups to quarters', () => {
    const s = scaleItems(chicken, 4 * G_PER.lb); // factor 1.27
    expect(s[0].amount).toBeCloseTo(4);
    expect(s[1].amount).toBe(1); // 1.27 cans → 1
    expect(s[2].amount).toBe(6); // 6.35 carrots → 6
    expect(s[3].amount).toBe(1.25); // 1.27 cups → 1¼
    expect(s[4].amount).toBeNull();
  });

  it('leaves fixed items alone and never rounds a scaled item down to zero', () => {
    const r = { ...chicken, items: chicken.items.map((i) => (i.id === 'peas' ? { ...i, scaling: 'fixed' as const } : i)) };
    expect(scaleItems(r, 1 * G_PER.lb)[3].amount).toBe(1);
    expect(scaleItems(chicken, 0.5 * G_PER.lb)[1].amount).toBe(1); // 0.16 can → still 1
  });

  it('chicken protein sets about 8 portions at 3.15 lb', () => {
    const t = totals(chicken.items);
    expect(Math.round(t.protein)).toBe(316); // 281 chicken + 25.5 beans + 2.8 carrots + 7 peas
    expect(portionsForProtein(t, 40)).toBe(8);
  });
});

describe('weigh-the-pot (Sweet Potato Beef Chili)', () => {
  // Totals from Sam's sheet: 4,705 kcal, 330 g protein, 5,060 g cooked.
  const items = [item('chili', 1, 'batch', 5060, (4705 / 5060) * 100, (330 / 5060) * 100)];

  it('gives 8 containers of ~588 kcal, ~41 g protein and ~632 g each', () => {
    const portions = portionsForProtein(totals(items), 40);
    expect(portions).toBe(8);
    const s = batchSummary({ items, portions, cookedWeightG: 5060 });
    expect(Math.round(s.each.kcal)).toBe(588);
    expect(Math.round(s.each.protein)).toBe(41);
    expect(Math.round(s.gramsEach!)).toBe(633);
  });

  it('leaves optional add-ons out of the totals', () => {
    const withCheese = [...items, item('cheddar', 1, 'cup', 113, 400, 22, { optional: true })];
    expect(Math.round(totals(withCheese).kcal)).toBe(4705);
  });
});

describe('starches', () => {
  // 4 cups dry long-grain rice (185 g/cup, 365 kcal/100 g) makes 12 cups cooked.
  const rice = { items: [item('rice', 4, 'cup', 185, 365, 7.1)], yieldAmount: 12 };

  it('works out per cup cooked from the batch', () => {
    expect(Math.round(perYieldUnit(rice).kcal)).toBe(225);
  });

  it('suggests rice to bring a 345 kcal chicken container up to ~650', () => {
    expect(starchToReach(345, 650, 225)).toBe(1.25);
    expect(starchToReach(700, 650, 225)).toBe(0);
  });

  it('works out dry rice for 2 frozen containers × 1¼ cups cooked', () => {
    const cook = starchToCook(rice, 2.5);
    expect(cook[0].amount).toBeCloseTo(0.833, 2);
  });
});

describe('units', () => {
  const carrotPortions = [
    { label: '1 cup chopped', grams: 128 },
    { label: '1 medium', grams: 61 },
    { label: '0.5 cup, chopped or diced', grams: 75 },
  ];

  it('offers weights, cup sizes and the food\'s own portions', () => {
    const opts = unitOptions(carrotPortions);
    const g = (u: string) => opts.find((o) => o.unit === u)?.gramsPerUnit;
    expect(g('lb')).toBeCloseTo(453.6, 0);
    expect(g('cup')).toBe(128);
    expect(g('tbsp')).toBe(8);
    expect(g('medium')).toBe(61);
    expect(g('cup, chopped or diced')).toBe(150);
  });

  it('reads the weight in a label like "can (15 oz)"', () => {
    expect(gramsFromLabel('can (15 oz)')).toBeCloseTo(425.2, 0);
    expect(gramsFromLabel('bag (2 lb)')).toBeCloseTo(907.2, 0);
    expect(gramsFromLabel('medium')).toBeUndefined();
  });

  it('formats amounts and weights', () => {
    expect(fmtAmount(1.3333)).toBe('1⅓');
    expect(fmtAmount(0.25)).toBe('¼');
    expect(fmtAmount(3.15)).toBe('3.15');
    expect(fmtAmount(2)).toBe('2');
    expect(fmtWeight(1429)).toBe('3.15 lb');
    expect(fmtWeight(142)).toBe('5 oz');
  });
});
