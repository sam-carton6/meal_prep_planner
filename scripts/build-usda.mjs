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

// Trimming (agreed with Sam, 20 Oct 2026): drop groups he won't cook with, drop brand-name products (generic
// versions stay; his own takeout and treats go in "My foods"), and merge duplicates.
const EXCLUDED_GROUPS = new Set([
  'Baby Foods',
  'Fast Foods',
  'Restaurant Foods',
  'American Indian/Alaska Native Foods',
]);
// USDA writes brand names in capitals ("QUAKER", "KRAFT VELVEETA"); these capitalised words are not brands.
const NOT_BRANDS = new Set(['USDA', "USDA'", 'USA', 'NFS', 'NFSMI', 'BBQ', 'DHA', 'UHT']);
const MIXED_CASE_BRANDS = /^(Pillsbury|Kraft|Kellogg|Quaker|Nabisco|Keebler|Archway|Martha White|Mission|Heinz|Gardenburger|Morningstar|Boca|Worthington|Loma Linda)\b/;
function isBranded(name) {
  if (MIXED_CASE_BRANDS.test(name)) return true;
  return (name.match(/\b[A-Z][A-Z'&-]{2,}\b/g) ?? []).some((w) => !NOT_BRANDS.has(w));
}

// Names that differ only by salt or a government-program tag are the same food for our purposes
// (we don't track sodium), e.g. "Carrots, cooked, boiled, drained, with salt" / "..., without salt".
const PROGRAM_TAG = /\s*\(Includes foods for USDA's Food Distribution Program\)/i;
const SALT = /,\s*(with|without) (added )?salt\b/gi;
const cleanName = (name) => name.replace(PROGRAM_TAG, '').replace(SALT, '').replace(/\s+/g, ' ').trim();
const dedupeKey = (name) => cleanName(name).toLowerCase();

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

const candidates = [];
const sources = [];
let skipped = 0;
let trimmed = 0;

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
    const group = categories.get(r.food_category_id) ?? 'Other';
    const name = r.description.trim();
    if (EXCLUDED_GROUPS.has(group) || isBranded(name)) {
      trimmed++;
      continue;
    }
    kept.set(r.fdc_id, {
      id: Number(r.fdc_id),
      name: name.replace(PROGRAM_TAG, ''),
      group: groupId(group),
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
    candidates.push(out);
  }
}

// Merge duplicates: keep one entry per cleaned name. Foundation (newer lab data) beats SR Legacy; otherwise
// the plainest name wins (no salt/program tag). Household portions from all copies are pooled.
const byKey = new Map();
for (const f of candidates) {
  const key = dedupeKey(f.name);
  (byKey.get(key) ?? byKey.set(key, []).get(key)).push(f);
}
const foods = [];
let merged = 0;
for (const copies of byKey.values()) {
  copies.sort((a, b) => (a.s === 'fd' ? 0 : 1) - (b.s === 'fd' ? 0 : 1) || a.name.length - b.name.length);
  const keep = { ...copies[0] };
  if (copies.length > 1) {
    merged += copies.length - 1;
    keep.name = cleanName(keep.name);
    const por = [...(keep.por ?? [])];
    for (const c of copies.slice(1)) for (const p of c.por ?? []) if (!por.some(([l]) => l === p[0])) por.push(p);
    if (por.length) keep.por = por;
  }
  foods.push(keep);
}

foods.sort((a, b) => a.name.localeCompare(b.name));

mkdirSync('public/data', { recursive: true });
const json = JSON.stringify({ built: new Date().toISOString().slice(0, 10), sources, groups, foods });
writeFileSync(OUT, json);
console.log(
  `Wrote ${OUT}: ${foods.length} foods, ${(json.length / 1e6).toFixed(2)} MB ` +
    `(trimmed ${trimmed} by group/brand, merged ${merged} duplicates, skipped ${skipped} with no nutrition)`,
);
