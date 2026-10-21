// The built-in USDA ingredient list (public/data/usda-foods.json, made by scripts/build-usda.mjs).
// Nutrition values are per 100 g.

export interface UsdaFile {
  built: string;
  sources: { key: SourceKey; label: string; release: string }[];
  groups: string[];
  foods: RawFood[];
}

export type SourceKey = 'fd' | 'sr';

// Compact shape as stored in the file (short keys keep it small).
interface RawFood {
  id: number;
  name: string;
  g: number; // index into groups
  s: SourceKey;
  k: number; // kcal
  p: number; // protein g
  c: number; // carbs g
  f: number; // fat g
  fb?: number; // fiber g
  por?: [string, number][]; // [label, grams]
}

// Readable shape the rest of the app uses.
export interface Food {
  id: number; // USDA FoodData Central id (fdc_id)
  name: string;
  group: string; // USDA food group, e.g. "Vegetables and Vegetable Products"
  source: SourceKey;
  per100g: Nutrition;
  portions: Portion[];
}

export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface Portion {
  label: string; // e.g. "1 medium", "1 cup chopped"
  grams: number;
}

export const SOURCE_NAMES: Record<SourceKey, string> = {
  fd: 'USDA Foundation',
  sr: 'USDA SR Legacy',
};

export function unpack(file: UsdaFile): Food[] {
  return file.foods.map((r) => ({
    id: r.id,
    name: r.name,
    group: file.groups[r.g] ?? 'Other',
    source: r.s,
    per100g: { kcal: r.k, protein: r.p, carbs: r.c, fat: r.f, fiber: r.fb },
    portions: (r.por ?? []).map(([label, grams]) => ({ label, grams })),
  }));
}

export async function loadFoods(): Promise<Food[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/usda-foods.json`);
  if (!res.ok) throw new Error(`Could not load the ingredient list (${res.status})`);
  return unpack(await res.json());
}

/** Nutrition for a given weight of a food. */
export function forGrams(per100g: Nutrition, grams: number): Nutrition {
  const r = grams / 100;
  return {
    kcal: per100g.kcal * r,
    protein: per100g.protein * r,
    carbs: per100g.carbs * r,
    fat: per100g.fat * r,
    fiber: per100g.fiber === undefined ? undefined : per100g.fiber * r,
  };
}
