// The recipe book: a standalone page made from data/meals.json (`npm run book` → public/recipe-book.html, served at
// /recipe-book.html). Same USDA matching as the app's import, so the numbers match what an import would save.
// Per container at Sam's own container counts, what the side ("serve_with") adds, and anything worth a look.

import type { Nutrition } from './model';
import { ZERO } from './model';
import { recipePreview, reviewRecipe, toCustomFood, type ImportFile, type ReviewRecipe } from './import-file';
import { itemGrams, itemNutrition, perYieldUnit, times, totals, add } from './recipe-math';
import { buildIndex } from './search';
import { fmtAmount } from './units';
import type { Food } from './usda';

export interface BookOptions {
  /** Calories a container plus its side aims for. */
  aimKcal: number;
  proteinPerMeal: number;
  /** Shown in the footer, e.g. "4 Nov 2026". */
  madeOn: string;
}

interface BookRecipe {
  rv: ReviewRecipe;
  total: Nutrition;
  /** Dishes: containers and one container. Sides: one yield unit (cup, bowl). */
  containers?: number;
  each: Nutrition;
  unit?: string;
  side?: { name: string; amount: number; unit: string; with: Nutrition };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Work out every number on the page (kept apart from the HTML so it can be tested). */
export function bookData(file: ImportFile, foods: Food[], opts: BookOptions) {
  const index = buildIndex(foods);
  const byId = new Map(foods.map((f) => [f.id, f]));
  const customs = file.foods.map((f) => toCustomFood(f));
  const all: BookRecipe[] = file.recipes.map((r) => {
    const rv = reviewRecipe(r, index, byId, foods, {}, customs);
    const total = totals(rv.lines.map((l) => l.item));
    if (r.kind === 'starch') {
      const each = perYieldUnit({ items: rv.lines.map((l) => l.item), yieldAmount: r.yield?.amount });
      return { rv, total, each, unit: (r.yield?.unit ?? 'cup').replace(/ cooked$/, '') };
    }
    const p = recipePreview(rv, opts.proteinPerMeal);
    return { rv, total, containers: p.containers, each: p.each ?? ZERO };
  });
  // Sides: "serve_with" names a starch/side recipe; add enough of it to reach the calorie aim (a bowl stays 1).
  for (const b of all) {
    const want = b.rv.file.serve_with?.trim().toLowerCase();
    const side = want ? all.find((x) => x.rv.file.kind === 'starch' && x.rv.file.name.trim().toLowerCase() === want) : undefined;
    if (!side || b.rv.file.kind === 'starch') continue;
    const perCup = side.each;
    const byCup = /cup/.test(side.unit ?? '');
    const amount = byCup ? Math.max(0, Math.round(((opts.aimKcal - b.each.kcal) / Math.max(1, perCup.kcal)) * 4) / 4) : 1;
    b.side = { name: side.rv.file.name, amount, unit: side.unit ?? '', with: add(b.each, times(perCup, amount)) };
  }
  const checks: string[] = [];
  for (const b of all) {
    for (const l of b.rv.lines) if (l.warn) checks.push(`<b>${esc(b.rv.file.name)}</b>, ${esc(l.ing.name)}: ${esc(l.warn)}`);
    if (b.rv.file.kind === 'dish' && b.each.protein < opts.proteinPerMeal - 0.5) {
      checks.push(`<b>${esc(b.rv.file.name)}</b> is ${n0(b.each.protein)} g protein per container (target ${opts.proteinPerMeal} g)${b.side ? `; ${n0(b.side.with.protein)} g with its side` : ''}.`);
    }
  }
  return { recipes: all, checks };
}

export function renderRecipeBook(file: ImportFile, foods: Food[], opts: BookOptions): string {
  const { recipes, checks } = bookData(file, foods, opts);
  const dishes = recipes.filter((b) => b.rv.file.kind !== 'starch');
  const rows = dishes.map((b) => `<tr><td><a href="#${slug(b.rv.file.name)}">${esc(b.rv.file.name)}</a></td>
<td class="num">${b.containers}</td><td class="num"><b>${n0(b.each.kcal)}</b></td>
<td class="num${b.each.protein < opts.proteinPerMeal - 0.5 ? ' low' : ''}">${n0(b.each.protein)} g</td>
<td>${b.side ? `+ ${fmtAmount(b.side.amount)} ${esc(b.side.unit)} ${esc(b.side.name.toLowerCase())} → <b>${n0(b.side.with.kcal)}</b> kcal · ${n0(b.side.with.protein)} g` : '<span class="muted">on its own</span>'}</td></tr>`).join('');

  const cards = [...dishes, ...recipes.filter((b) => b.rv.file.kind === 'starch')].map((b) => {
    const r = b.rv.file;
    const stats = r.kind === 'starch'
      ? `<div><span class="big">${n0(b.each.kcal)}</span><span class="lab">kcal per ${esc(b.unit ?? '')}</span></div>
<div><span class="big">${n0(b.each.protein)} g</span><span class="lab">protein per ${esc(b.unit ?? '')}</span></div>
<div><span class="big">${fmtAmount(r.yield?.amount ?? 1)}</span><span class="lab">${esc(r.yield?.unit ?? '')} per batch</span></div>`
      : `<div><span class="big">${n0(b.each.kcal)}</span><span class="lab">kcal per container</span></div>
<div><span class="big${b.each.protein < opts.proteinPerMeal - 0.5 ? ' lowtxt' : ''}">${n0(b.each.protein)} g</span><span class="lab">protein per container</span></div>
<div><span class="big">${b.containers}</span><span class="lab">containers</span></div>
${b.side ? `<div><span class="big">${n0(b.side.with.kcal)}</span><span class="lab">kcal with ${fmtAmount(b.side.amount)} ${esc(b.side.unit)} ${esc(b.side.name.toLowerCase())}</span></div>` : ''}`;
    const lines = b.rv.lines.map((l) => {
      if (l.ing.amount === null) return `<li class="taste"><span class="amt">${esc(l.ing.unit)}</span><span class="ing">${esc(l.ing.name)}</span><span class="kc"></span></li>`;
      const n = itemNutrition(l.item);
      const g = itemGrams(l.item);
      const pills = `${l.item.drained ? ' <span class="pill">drained</span>' : ''}${l.ing.optional ? ' <span class="pill">optional, not counted</span>' : ''}`;
      return `<li class="${l.warn ? 'warnrow' : ''}${l.ing.optional ? ' opt' : ''}"><span class="amt">${fmtAmount(l.ing.amount)} ${esc(l.ing.unit)}</span>
<span class="ing">${esc(l.ing.name)}${pills}<small>→ ${esc(l.matched)}${g ? ` · ${n0(g)} g` : ''}</small>${l.warn ? `<small class="w">⚠ ${esc(l.warn)}</small>` : ''}</span>
<span class="kc">${n0(n.kcal)}<small>${n0(n.protein)} g</small></span></li>`;
    }).join('');
    return `<article class="recipe" id="${slug(r.name)}"><header><span class="kind">${r.kind === 'starch' ? 'Side' : 'Dish'}</span><h2>${esc(r.name)}</h2></header>
<div class="stats">${stats}</div>
<ul class="ing-list"><li class="lh"><span class="amt">Amount</span><span class="ing">Ingredient</span><span class="kc">kcal<small>prot.</small></span></li>${lines}</ul>
<p class="total">Whole batch: <b>${n0(b.total.kcal)}</b> kcal · ${n0(b.total.protein)} g protein · ${n0(b.total.carbs)} g carbs · ${n0(b.total.fat)} g fat</p>
${r.notes ? `<p class="notes">${esc(r.notes)}</p>` : ''}</article>`;
  }).join('');

  const foodsList = file.foods.length
    ? `<section class="foods"><h3>Foods</h3><ul>${file.foods.map((f) => {
        const c = toCustomFood(f);
        return `<li><b>${esc(c.name)}</b>${c.brand ? ` <span class="muted">${esc(c.brand)}</span>` : ''}: ${n0(c.perServing.kcal)} kcal · ${n0(c.perServing.protein)} g protein per ${esc(c.servingLabel)}${c.units?.length ? ` <span class="muted">(also by ${c.units.map((u) => `${esc(u.unit)} = ${n0(u.grams)} g`).join(', ')})</span>` : ''}</li>`;
      }).join('')}</ul></section>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Meal Prep Recipe Book</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Public+Sans:wght@400;600;700&display=swap">
<style>${CSS}</style></head><body><div class="wrap">
<div><h1>Meal Prep Recipe Book</h1>
<p class="lede">Made from <code>data/meals.json</code>: each ingredient matched to USDA the way the app's import does it, per container at your container counts, and what the side adds toward about ${n0(opts.aimKcal)} kcal.</p></div>
<div class="tablebox"><table><thead><tr><th>Dish</th><th class="num">Containers</th><th class="num">kcal each</th><th class="num">Protein</th><th>With its side</th></tr></thead><tbody>${rows}</tbody></table></div>
${checks.length ? `<section class="checks"><h3>Worth a look</h3><ul>${checks.map((c) => `<li>${c}</li>`).join('')}</ul></section>` : ''}
<div class="grid">${cards}</div>
${foodsList}
<p class="foot">USDA SR Legacy and Foundation Foods; “to taste” lines count as 0. Made ${esc(opts.madeOn)} with <code>npm run book</code>.</p>
</div></body></html>
`;
}

const CSS = `
:root{--bg:#f5f7f4;--card:#fff;--fg:#1d2420;--muted:#5f6b64;--line:#dfe5e0;--accent:#2f6f4f;--warn:#a8650a;--warnbg:#fbf1df;--pill:#e8efe9;
--display:'Young Serif',Georgia,'Times New Roman',serif;--body:'Public Sans',-apple-system,'Segoe UI',Roboto,sans-serif;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#111513;--card:#181e1b;--fg:#e6ece8;--muted:#9aa69f;--line:#2b3430;--accent:#7cc4a0;--warn:#e3a94f;--warnbg:#2c2416;--pill:#22302a;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#111513;--card:#181e1b;--fg:#e6ece8;--muted:#9aa69f;--line:#2b3430;--accent:#7cc4a0;--warn:#e3a94f;--warnbg:#2c2416;--pill:#22302a;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 var(--body);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:calc(20px + env(safe-area-inset-top,0px)) calc(48px + env(safe-area-inset-bottom,0px))}
.wrap{max-width:1180px;margin:0 auto;display:grid;gap:28px}
h1{font:400 clamp(1.9rem,4vw,2.6rem)/1.1 var(--display);margin:0;text-wrap:balance}
h2{font:400 1.35rem/1.2 var(--display);margin:2px 0 0;text-wrap:balance}
h3{font:400 1.1rem var(--display);margin:0 0 6px}
.lede{color:var(--muted);max-width:65ch;margin:8px 0 0}
a{color:var(--accent)}
code{font-size:.9em}
.tablebox{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;min-width:560px;font-variant-numeric:tabular-nums}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
tr:last-child td{border-bottom:none}
.num{text-align:right;white-space:nowrap}
.low,.lowtxt{color:var(--warn);font-weight:700}
.muted{color:var(--muted)}
.checks{background:var(--warnbg);border-radius:10px;padding:14px 18px}
.checks ul,.foods ul{margin:0;padding-left:18px;display:grid;gap:6px;max-width:85ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:20px;align-items:start}
.recipe{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;min-width:0}
.kind{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-weight:700}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin:12px 0 10px;padding:10px 0;border-block:1px solid var(--line)}
.stats div{display:flex;flex-direction:column}
.big{font:400 1.45rem/1.1 var(--display);font-variant-numeric:tabular-nums}
.lab{font-size:.75rem;color:var(--muted)}
.ing-list{list-style:none;margin:0;padding:0}
.ing-list li{display:grid;grid-template-columns:7.5em minmax(0,1fr) 4.5em;gap:10px;padding:7px 0;border-bottom:1px dashed var(--line);align-items:baseline}
.ing-list li.lh{font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line)}
.amt{font-weight:600;font-variant-numeric:tabular-nums}
.ing small{display:block;color:var(--muted);font-size:.78rem}
.ing small.w{color:var(--warn)}
.kc{text-align:right;font-variant-numeric:tabular-nums}
.kc small{display:block;color:var(--muted);font-size:.78rem}
li.taste{color:var(--muted)} li.opt{opacity:.7}
li.warnrow{background:linear-gradient(90deg,var(--warnbg),transparent)}
.pill{display:inline-block;font-size:.68rem;background:var(--pill);border-radius:999px;padding:0 7px;margin-left:4px;vertical-align:1px}
.total{margin:10px 0 0;font-variant-numeric:tabular-nums}
.notes{margin:8px 0 0;color:var(--muted);font-size:.9rem;max-width:65ch}
.foot{color:var(--muted);font-size:.85rem;max-width:80ch}
@media (max-width:440px){.ing-list li{grid-template-columns:5.6em minmax(0,1fr) 3.6em;gap:8px}}
`;
