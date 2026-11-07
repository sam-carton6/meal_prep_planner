// node scripts/macros.mjs [file] [name regex]: each ingredient's grams and macros, and per container, for checking a
// recipe change with Sam before it goes into data/meals.json. Uses the app's own import code, like the recipe book.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { parseImportFile, reviewRecipe, toCustomFood } = await server.ssrLoadModule('/src/import-file.ts');
  const { itemNutrition, totals, itemGrams } = await server.ssrLoadModule('/src/recipe-math.ts');
  const { buildIndex } = await server.ssrLoadModule('/src/search.ts');
  const { unpack } = await server.ssrLoadModule('/src/usda.ts');
  const foods = unpack(JSON.parse(readFileSync('public/data/usda-foods.json', 'utf8')));
  const index = buildIndex(foods); const byId = new Map(foods.map((f) => [f.id, f]));
  const file = parseImportFile(readFileSync(process.argv[2] ?? 'data/meals.json', 'utf8'));
  const customs = file.foods.map((f) => toCustomFood(f));
  const r0 = (x) => Math.round(x);
  for (const r of file.recipes.filter((r) => new RegExp(process.argv[3] ?? '.').test(r.name))) {
    const rv = reviewRecipe(r, index, byId, foods, {}, customs);
    const items = rv.lines.map((l) => l.item);
    const n = r.servings ?? 5;
    console.log(`\n## ${r.name} (${n} containers)`);
    for (const l of rv.lines) { const x = itemNutrition(l.item); console.log(`${l.ing.amount ?? ''} ${l.ing.unit} ${l.ing.name} = ${r0(itemGrams(l.item))} g | ${r0(x.kcal)} kcal P${r0(x.protein)} C${r0(x.carbs)} F${r0(x.fat)} [${l.matched}]`); }
    const t = totals(items);
    console.log(`TOTAL ${r0(t.kcal)} kcal P${r0(t.protein)} C${r0(t.carbs)} F${r0(t.fat)} | PER CONTAINER ${r0(t.kcal/n)} kcal P${r0(t.protein/n)} C${r0(t.carbs/n)} F${r0(t.fat/n)}`);
  }
} finally { await server.close(); }
