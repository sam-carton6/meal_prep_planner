import { describe, expect, it } from 'vitest';
import type { CalendarEntry, CustomFood, Recipe, RecipeItem } from './model';
import { buildCards, cardEntry, cardTweaks, customUnits, stepTweak, type MealCard } from './bank';

const item = (grams: number, kcal: number, protein: number): RecipeItem => ({
  id: 'i', name: 'x', food: { kind: 'none' }, per100g: { kcal, protein, carbs: 0, fat: 0 },
  amount: grams, unit: 'g', gramsPerUnit: 1, scaling: 'scale',
});
const chili: Recipe = { id: 'chili', name: 'Chili', kind: 'dish', items: [item(1600, 200, 20)], createdAt: '', updatedAt: '' };
const rice: Recipe = { id: 'rice', name: 'White rice', kind: 'starch', yieldAmount: 12, yieldUnit: 'cup cooked',
  items: [item(1200, 200, 4)], createdAt: '', updatedAt: '' }; // 200 kcal per cup cooked
const shake: CustomFood = {
  id: 'nm', name: 'Naked Mass, chocolate', servingLabel: '1 serving (about 7 scoops)', servingGrams: 333,
  perServing: { kcal: 1360, protein: 50, carbs: 251, fat: 15 }, units: [{ unit: 'scoop', grams: 55 }],
};

const base = { recipes: [chili, rice], batches: [], customFoods: [shake], entries: [], mealKcalAim: 700, proteinPerMeal: 40 };
const find = (cards: MealCard[], id: string) => cards.find((c) => c.id === id)!;

describe('meal bank cards', () => {
  it('makes a card per dish, per dish + starch, and per My foods entry', () => {
    const cards = buildCards(base);
    expect(cards.map((c) => c.id)).toEqual(['dish:chili', 'dish:chili+rice', 'food:nm']);
  });

  it('leaves out My foods that are only recipe ingredients', () => {
    const adobo: CustomFood = { id: 'adobo', name: 'Chipotle peppers in adobo', servingLabel: '1 can', perServing: { kcal: 150, protein: 3, carbs: 0, fat: 0 } };
    const withAdobo: Recipe = { ...chili, items: [...chili.items, { ...chili.items[0], id: 'a', food: { kind: 'custom', id: 'adobo' } }] };
    const cards = buildCards({ ...base, recipes: [withAdobo, rice], customFoods: [shake, adobo] });
    expect(cards.some((c) => c.id === 'food:adobo')).toBe(false);
  });

  it('suggests starch to reach the aim and builds a container entry', () => {
    // 3200 kcal, 320 g protein → 8 containers of 400 kcal; 300 kcal to go at 200 per cup → 1½ cups
    const card = find(buildCards(base), 'dish:chili+rice');
    const e = cardEntry(card);
    expect(e.label).toBe('Chili + 1½ cup white rice');
    expect(e.nutrition.kcal).toBeCloseTo(700);
    expect(e.source).toEqual({ kind: 'dish', recipeId: 'chili', portions: 1, starch: { recipeId: 'rice', cups: 1.5 } });
  });

  it('tweaks servings and cups in steps; starch stays the amount on the plate', () => {
    const card = find(buildCards(base), 'dish:chili+rice');
    let t = stepTweak(card, {}, 'servings', 1); // 1½ servings
    t = stepTweak(card, t, 'cups', -1); // 1¼ cups
    const e = cardEntry(card, t);
    expect(e.label).toBe('Chili ×1½ + 1¼ cup white rice');
    expect(e.nutrition.kcal).toBeCloseTo(400 * 1.5 + 250);
    expect(stepTweak(card, { servings: 0.5 }, 'servings', -1).servings).toBe(0.5); // never below ½
  });

  it('counts My foods in their extra units (scoops), switching unit on tap', () => {
    expect(customUnits(shake).map((u) => u.unit)).toEqual(['serving (about 7 scoops)', 'scoop', 'g']);
    const card = find(buildCards(base), 'food:nm');
    expect(cardTweaks(card)[0]).toMatchObject({ text: 'scoop', canCycle: true });
    let t = stepTweak(card, {}, 'amount', 1);
    t = stepTweak(card, t, 'amount', 1); // 3 scoops
    const e = cardEntry(card, t);
    expect(e.label).toBe('Naked Mass, chocolate (3 scoop)');
    expect(e.nutrition.kcal).toBeCloseTo((1360 * 165) / 333);
    expect(e.source).toEqual({ kind: 'food', food: { kind: 'custom', id: 'nm' }, amount: 3, unit: 'scoop' });
    expect(cardEntry(card, stepTweak(card, t, 'unit', 1)).label).toBe('Naked Mass, chocolate (100 g)');
  });

  it('starts from the last amounts used, puts recent cards first, and adds other recent foods', () => {
    const entries: CalendarEntry[] = [
      { id: '1', date: '2026-11-03', slot: 'breakfast', label: 'Naked Mass, chocolate (3 scoop)', eaten: true,
        nutrition: { kcal: 600, protein: 22, carbs: 0, fat: 0 }, source: { kind: 'food', food: { kind: 'custom', id: 'nm' }, amount: 3, unit: 'scoop' } },
      { id: '2', date: '2026-11-02', slot: 'snack', label: 'Greek yogurt, plain (1 cup)', eaten: true,
        nutrition: { kcal: 150, protein: 20, carbs: 0, fat: 0 }, source: { kind: 'food', food: { kind: 'usda', id: 5 }, amount: 1, unit: 'cup' } },
    ];
    const cards = buildCards({ ...base, entries });
    expect(cards.map((c) => c.id)).toEqual(['food:nm', 'recent:greek yogurt, plain', 'dish:chili', 'dish:chili+rice']);
    expect(cardEntry(cards[0]).label).toBe('Naked Mass, chocolate (3 scoop)');
    const yogurt = cardEntry(cards[1], stepTweak(cards[1], {}, 'amount', 1));
    expect(yogurt.label).toBe('Greek yogurt, plain (1¼ cup)');
    expect(yogurt.nutrition.kcal).toBeCloseTo(187.5);
  });
});
