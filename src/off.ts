// Packaged foods from Open Food Facts (free, no key, https://world.openfoodfacts.org): search by name or barcode
// number, read the label values, and turn the ones Sam picks into My foods. Needs internet; nothing is sent but the
// search words or barcode.

import type { CustomFood, Nutrition } from './model';
import { newId, ZERO } from './model';

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_en,generic_name,brands,quantity,serving_size,serving_quantity,nutriments';

export interface OffProduct {
  code: string;
  name: string;
  brand?: string;
  /** Package size as printed, e.g. "333 g". */
  quantity?: string;
  /** Serving as printed, e.g. "1 scoop (55 g)". */
  servingLabel?: string;
  servingGrams?: number;
  per100g?: Nutrition;
  perServing?: Nutrition;
}

export const isBarcode = (q: string) => /^\d{8,14}$/.test(q.replace(/\s+/g, ''));
export const barcodeUrl = (code: string) => `${BASE}/api/v2/product/${encodeURIComponent(code.replace(/\s+/g, ''))}.json?fields=${FIELDS}`;
export const searchUrl = (q: string) =>
  `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q.trim())}&search_simple=1&action=process&json=1&page_size=24&fields=${FIELDS}`;

type Raw = Record<string, unknown>;
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** kcal, protein, carbs, fat with a suffix ("_100g" / "_serving"); kcal from kJ if that's all there is. */
function nutrition(n: Raw, suffix: string): Nutrition | undefined {
  const kj = num(n[`energy-kj${suffix}`]) ?? (n['energy_unit'] === 'kJ' || n['energy_unit'] === undefined ? num(n[`energy${suffix}`]) : undefined);
  const kcal = num(n[`energy-kcal${suffix}`]) ?? (kj !== undefined ? kj / 4.184 : undefined);
  if (kcal === undefined) return undefined;
  return {
    kcal,
    protein: num(n[`proteins${suffix}`]) ?? 0,
    carbs: num(n[`carbohydrates${suffix}`]) ?? 0,
    fat: num(n[`fat${suffix}`]) ?? 0,
  };
}

/** Grams in a serving like "55 g", "1 scoop (55 g)", "2 oz (56g)". */
export function servingGramsFrom(label?: string): number | undefined {
  if (!label) return undefined;
  const m = label.match(/([\d.,]+)\s*(g|gr|grams?|ml)\b/i);
  if (m) return num(m[1]);
  const oz = label.match(/([\d.,]+)\s*oz\b/i);
  return oz ? (num(oz[1]) ?? 0) * 28.3495 : undefined;
}

export function parseProduct(p: Raw | null | undefined): OffProduct | null {
  if (!p) return null;
  const name = String(p.product_name_en || p.product_name || p.generic_name || '').trim();
  const n = (p.nutriments ?? {}) as Raw;
  const per100g = nutrition(n, '_100g');
  const servingLabel = String(p.serving_size ?? '').trim() || undefined;
  const servingGrams = num(p.serving_quantity) || servingGramsFrom(servingLabel);
  let perServing = nutrition(n, '_serving');
  if (!perServing && per100g && servingGrams) {
    const k = servingGrams / 100;
    perServing = { kcal: per100g.kcal * k, protein: per100g.protein * k, carbs: per100g.carbs * k, fat: per100g.fat * k };
  }
  if (!name || (!per100g && !perServing)) return null; // nothing useful on the label
  return {
    code: String(p.code ?? ''),
    name,
    brand: String(p.brands ?? '').split(',')[0].trim() || undefined,
    quantity: String(p.quantity ?? '').trim() || undefined,
    servingLabel,
    servingGrams,
    per100g,
    perServing,
  };
}

/** Read a barcode lookup's reply. */
export function parseBarcodeReply(data: Raw): OffProduct | null {
  return data.status === 1 || data.status === 'success' ? parseProduct(data.product as Raw) : null;
}

/** Read a search reply. */
export function parseSearchReply(data: Raw): OffProduct[] {
  const list = Array.isArray(data.products) ? (data.products as Raw[]) : [];
  return list.map(parseProduct).filter((p): p is OffProduct => p !== null);
}

/** Look up by barcode, or search by name. Throws a plain-language error when offline or the site is down. */
export async function lookup(q: string, fetchFn: typeof fetch = fetch): Promise<OffProduct[]> {
  const query = q.trim();
  if (!query) return [];
  let res: Response;
  try {
    res = await fetchFn(isBarcode(query) ? barcodeUrl(query) : searchUrl(query));
  } catch {
    throw new Error("Couldn't reach Open Food Facts. Looking foods up needs internet.");
  }
  if (res.status === 404 && isBarcode(query)) return [];
  if (res.status === 429) throw new Error('Open Food Facts says too many searches: wait a minute and try again.');
  if (!res.ok) throw new Error(`Open Food Facts didn't answer properly (error ${res.status}). Try again later.`);
  const data = (await res.json()) as Raw;
  if (isBarcode(query)) {
    const p = parseBarcodeReply(data);
    return p ? [p] : [];
  }
  return parseSearchReply(data);
}

/**
 * A My foods entry from a product: per serving when the label gives one with its weight, else per 100 g.
 * The serving weight makes grams (and any units Sam adds later) work.
 */
export function offToCustomFood(p: OffProduct): CustomFood {
  const useServing = !!(p.perServing && p.servingGrams);
  const printed = (p.servingLabel ?? `${Math.round(p.servingGrams ?? 0)} g`).replace(/\s*\(([^)]*)\)/, ', $1');
  const unit = useServing ? unitFromServing(p.servingLabel, p.servingGrams!) : undefined;
  return {
    id: newId(),
    name: p.name,
    ...(p.brand ? { brand: p.brand } : {}),
    ...(p.code ? { barcode: p.code } : {}),
    servingLabel: useServing ? `1 serving (${printed})` : '100 g',
    servingGrams: useServing ? p.servingGrams : 100,
    perServing: useServing ? p.perServing! : p.per100g ?? ZERO,
    ...(unit ? { units: [unit] } : {}),
  };
}

/** "4 scoops (333 g)" → scoop = 83.25 g; "2 biscuits (25 g)" → biscuit = 12.5 g. Plain weights give nothing. */
export function unitFromServing(label: string | undefined, grams: number): { unit: string; grams: number } | undefined {
  const m = label?.match(/^\s*([\d.,]+|an?|one)\s+([a-z][a-z ]*?)s?\s*(\(|$)/i);
  if (!m) return undefined;
  const count = /^(an?|one)$/i.test(m[1]) ? 1 : num(m[1]);
  const word = m[2].trim().toLowerCase();
  if (!count || count <= 0 || /^(g|gr|grams?|oz|ounces?|ml|servings?|portions?)$/.test(word)) return undefined;
  return { unit: word, grams: Math.round((grams / count) * 100) / 100 };
}
