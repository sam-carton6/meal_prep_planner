// Canned goods: "whole can" vs "drained". USDA lists both kinds for beans etc. ("..., canned" / "..., drained");
// a drained 15 oz can of beans weighs about 60% of the can (USDA: kidney 266 g of 436 g, pinto 277 g of 442 g).

import type { ItemVariant, RecipeItem } from './model';
import { gramsFromLabel } from './units';
import type { Food } from './usda';

export const DRAINED_FRACTION = 0.6;

const isCanned = (name: string) => /\bcanned\b/i.test(name);
const isDrained = (name: string) => /\bdrained\b/i.test(name);

/** "Beans, black turtle, mature seeds, canned" → "beans black": the food plus its first word of kind. */
function baseKey(name: string): string {
  const [a = '', b = ''] = name.toLowerCase().split(',').map((s) => s.trim());
  return `${a} ${b.split(' ')[0]}`;
}

/** The whole-can and drained versions of a canned food, if USDA has both. */
export function canPair(food: Pick<Food, 'name'>, foods: Food[]): { whole: Food; drained: Food } | null {
  if (!isCanned(food.name)) return null;
  const key = baseKey(food.name);
  const same = foods.filter((f) => isCanned(f.name) && baseKey(f.name) === key);
  const pick = (list: Food[], prefer: RegExp) => list.find((f) => prefer.test(f.name)) ?? list[0];
  const whole = isDrained(food.name)
    ? pick(same.filter((f) => !isDrained(f.name) && !/low sodium/i.test(f.name)), /solids and liquid/i)
    : (food as Food);
  const drained = isDrained(food.name)
    ? (food as Food)
    : pick(same.filter((f) => isDrained(f.name)), /drained and rinsed|drained solids$/i);
  return whole && drained ? { whole, drained } : null;
}

const variant = (f: Food, gramsPerUnit: number): ItemVariant => ({
  food: { kind: 'usda', id: f.id },
  foodName: f.name,
  per100g: f.per100g,
  gramsPerUnit,
});

/** Give a canned item its whole/drained options (or null if it isn't a can of something USDA has both of). */
export function withDrainOptions(item: RecipeItem, foods: Food[], drained = false): RecipeItem {
  if (item.food.kind !== 'usda' || !/^can\b/i.test(item.unit)) return item;
  const id = item.food.id;
  const food = foods.find((f) => f.id === id);
  const pair = food && canPair(food, foods);
  if (!pair) return item;
  const canGrams = gramsFromLabel(item.unit) ?? item.gramsPerUnit;
  const drain = {
    whole: variant(pair.whole, canGrams),
    drained: variant(pair.drained, Math.round(canGrams * DRAINED_FRACTION)),
  };
  return setDrained({ ...item, drain, drained: false }, drained);
}

/** Switch a canned item between whole can and drained (keeps the number of cans). */
export function setDrained(item: RecipeItem, drained: boolean): RecipeItem {
  if (!item.drain) return item;
  const v = drained ? item.drain.drained : item.drain.whole;
  return { ...item, drained, food: v.food, per100g: v.per100g, gramsPerUnit: v.gramsPerUnit };
}
