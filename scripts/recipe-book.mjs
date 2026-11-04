// npm run book: make public/recipe-book.html from data/meals.json (served by the app at /recipe-book.html).
// Runs the app's own TypeScript (src/recipe-book.ts) through Vite, so the numbers match the import exactly.
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { renderRecipeBook } = await server.ssrLoadModule('/src/recipe-book.ts');
  const { parseImportFile } = await server.ssrLoadModule('/src/import-file.ts');
  const { unpack } = await server.ssrLoadModule('/src/usda.ts');
  const foods = unpack(JSON.parse(readFileSync('public/data/usda-foods.json', 'utf8')));
  const file = parseImportFile(readFileSync('data/meals.json', 'utf8'));
  const madeOn = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  writeFileSync('public/recipe-book.html', renderRecipeBook(file, foods, { aimKcal: 750, proteinPerMeal: 40, madeOn }));
  console.log(`public/recipe-book.html: ${file.recipes.length} recipes, ${file.foods.length} foods`);
} finally {
  await server.close();
}
