// Builds public/data/usda-foods.json from the raw USDA FoodData Central CSV downloads.
//
// Run once (or when USDA publishes a new release):
//   1. Download the CSV zips from https://fdc.nal.usda.gov/download-datasets/ :
//        Foundation Foods (latest) and SR Legacy (2018-04)
//   2. Unzip them into data/raw/foundation/ and data/raw/sr_legacy/
//   3. npm run usda
//
// Output: one small JSON file the app ships with. Values are per 100 g.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

const RAW = 'data/raw';
const OUT = 'public/data/usda-foods.json';

const SOURCES = [
  { key: 'fd', dir: 'foundation', dataType: 'foundation_food', label: 'USDA Foundation Foods' },
  { key: 'sr', dir: 'sr_legacy', dataType: 'sr_legacy_food', label: 'USDA SR Legacy' },
];

// USDA nutrient ids
const N = {
  energy: '1008', // kcal
  energyAtwaterSpecific: '2048',
  energyAtwaterGeneral: '2047',
  protein: '1003',
  fat: '1004',
  carbs: '1005', // by difference
  carbsSum: '1050', // by summation (some Foundation foods only have this)
  fiber: '1079',
};
const WANTED = new Set(Object.values(N));

function readCsv(dir, name) {
  // Each zip unpacks into a dated subfolder, e.g. FoodData_Central_sr_legacy_food_csv_2018-04/
  const sub = readdirSync(dir).find((d) => d.startsWith('FoodData_Central'));
  const path = join(dir, sub ?? '', `${name}.csv`);
  return parse(readFileSync(path), { columns: true, skip_empty_lines: true, bom: true });
}

function releaseOf(dir) {
  const sub = readdirSync(dir).find((d) => d.startsWith('FoodData_Central')) ?? '';
  return sub.match(/(\d{4}-\d{2}(-\d{2})?)$/)?.[1] ?? 'unknown';
}

const round1 = (x) => Math.round(x * 10) / 10;

function formatAmount(a) {
  const n = Number(a);
  if (!Number.isFinite(n) || n === 0) return '';
  return String(round1(n));
}

function portionLabel(row, unitNames) {
  const amount = formatAmount(row.amount);
  const unit = row.measure_unit_id === '9999' ? '' : unitNames.get(row.measure_unit_id) ?? '';
  const extra = [row.portion_description, row.modifier].filter((s) => s && s.trim()).join(', ');
  const parts = [amount, unit, extra].filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

const groups = []; // food group names; foods store an index into this list
const groupIndex = new Map();
function groupId(name) {
  if (!groupIndex.has(name)) {
    groupIndex.set(name, groups.length);
    groups.push(name);
  }
  return groupIndex.get(name);
}

const foods = [];
const sources = [];
let skipped = 0;

for (const src of SOURCES) {
  const dir = join(RAW, src.dir);
  if (!existsSync(dir)) {
    console.error(`Missing ${dir}. See the instructions at the top of this script.`);
    process.exit(1);
  }
  sources.push({ key: src.key, label: src.label, release: releaseOf(dir) });

  const categories = new Map(readCsv(dir, 'food_category').map((r) => [r.id, r.description]));
  const unitNames = new Map(readCsv(dir, 'measure_unit').map((r) => [r.id, r.name]));

  const kept = new Map(); // fdc_id -> food
  for (const r of readCsv(dir, 'food')) {
    if (r.data_type !== src.dataType) continue;
    kept.set(r.fdc_id, {
      id: Number(r.fdc_id),
      name: r.description.trim(),
      group: groupId(categories.get(r.food_category_id) ?? 'Other'),
      src: src.key,
      n: {},
      portions: [],
    });
  }

  for (const r of readCsv(dir, 'food_nutrient')) {
    const f = kept.get(r.fdc_id);
    if (!f || !WANTED.has(r.nutrient_id) || r.amount === '') continue;
    f.n[r.nutrient_id] = Number(r.amount);
  }

  for (const r of readCsv(dir, 'food_portion')) {
    const f = kept.get(r.fdc_id);
    const grams = Number(r.gram_weight);
    if (!f || !(grams > 0)) continue;
    const label = portionLabel(r, unitNames);
    if (!label || f.portions.some(([l]) => l === label)) continue;
    f.portions.push([label, round1(grams)]);
  }

  for (const f of kept.values()) {
    const n = f.n;
    const protein = n[N.protein] ?? 0;
    const fat = n[N.fat] ?? 0;
    const carbs = n[N.carbs] ?? n[N.carbsSum] ?? 0;
    let kcal = n[N.energy] ?? n[N.energyAtwaterSpecific] ?? n[N.energyAtwaterGeneral];
    if (kcal === undefined) {
      if (n[N.protein] === undefined && n[N.fat] === undefined) {
        skipped++; // no usable nutrition at all
        continue;
      }
      kcal = 4 * protein + 4 * carbs + 9 * fat;
    }
    // Compact keys keep the file small: k=kcal p=protein c=carbs f=fat fb=fiber (per 100 g), g=group index,
    // s=source key, por=[[label, grams], ...]
    const out = { id: f.id, name: f.name, g: f.group, s: f.src, k: round1(kcal), p: round1(protein), c: round1(carbs), f: round1(fat) };
    if (n[N.fiber] !== undefined) out.fb = round1(n[N.fiber]);
    if (f.portions.length) out.por = f.portions;
    foods.push(out);
  }
}

foods.sort((a, b) => a.name.localeCompare(b.name));

mkdirSync('public/data', { recursive: true });
const json = JSON.stringify({ built: new Date().toISOString().slice(0, 10), sources, groups, foods });
writeFileSync(OUT, json);
console.log(`Wrote ${OUT}: ${foods.length} foods (${skipped} skipped with no nutrition), ${(json.length / 1e6).toFixed(2)} MB`);
