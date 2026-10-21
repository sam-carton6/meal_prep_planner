// Units: turning "3.15 lb" or "5 medium" into grams, and grams back into something readable.

import type { Portion } from './usda';

export const G_PER = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 } as const;
const WEIGHT_UNITS = Object.keys(G_PER) as (keyof typeof G_PER)[];

/** Volume units relative to one cup, used when a food only lists e.g. "1 cup = 240 g". */
const CUPS_PER: Record<string, number> = { cup: 1, tbsp: 1 / 16, tsp: 1 / 48, 'fl oz': 1 / 8, ml: 1 / 236.6 };

export interface UnitOption {
  unit: string;
  gramsPerUnit: number;
  /** True when grams were estimated (no USDA measure for it). */
  estimated?: boolean;
}

/** Grams in the first USDA portion that is "1 <word>..." (e.g. "1 cup chopped"), per one unit. */
function portionGrams(portions: Portion[], word: string): number | undefined {
  for (const p of portions) {
    const m = p.label.match(/^([\d.]+)\s+(.*)$/);
    if (!m) continue;
    const amount = Number(m[1]);
    const rest = m[2].toLowerCase();
    if (amount > 0 && (rest === word || rest.startsWith(word + ' ') || rest.startsWith(word + ','))) {
      return p.grams / amount;
    }
  }
  return undefined;
}

/** All units that make sense for a food: weights, volumes (if USDA gives a cup/tbsp size), and its portions. */
export function unitOptions(portions: Portion[]): UnitOption[] {
  const opts: UnitOption[] = WEIGHT_UNITS.map((u) => ({ unit: u, gramsPerUnit: G_PER[u] }));
  const cup =
    portionGrams(portions, 'cup') ??
    (portionGrams(portions, 'tbsp') ?? portionGrams(portions, 'tablespoon') ?? NaN) * 16;
  if (Number.isFinite(cup)) {
    for (const [u, c] of Object.entries(CUPS_PER)) opts.push({ unit: u, gramsPerUnit: cup * c });
  }
  for (const p of portions) {
    const m = p.label.match(/^([\d.]+)\s+(.*)$/);
    const amount = m ? Number(m[1]) : 1;
    const label = m ? m[2] : p.label;
    if (!label || opts.some((o) => o.unit === label)) continue;
    opts.push({ unit: label, gramsPerUnit: p.grams / (amount || 1) });
  }
  return opts;
}

/** Grams for a unit written like "can (15 oz)" or "bag (2 lb)": the weight in brackets. */
export function gramsFromLabel(unit: string): number | undefined {
  const m = unit.match(/\(([\d.]+)\s*(g|kg|oz|lb)\)/i);
  if (!m) return undefined;
  return Number(m[1]) * G_PER[m[2].toLowerCase() as keyof typeof G_PER];
}

/** Smallest sensible step for an amount in this unit: whole cans/onions, quarter cups, any weight. */
export function stepFor(unit: string): number {
  if ((WEIGHT_UNITS as string[]).includes(unit) || unit === 'ml' || unit === 'fl oz') return 0;
  if (unit === 'cup') return 0.25;
  if (unit === 'tbsp' || unit === 'tsp') return 0.5;
  return 1; // medium, whole, can (15 oz), head, clove...
}

export function roundToStep(amount: number, step: number): number {
  if (!step) return amount;
  return Math.max(step, Math.round(amount / step) * step);
}

/** Friendly number: 3.15, 0.5, 1⅓ style for cups. */
export function fmtAmount(n: number): string {
  if (!Number.isFinite(n)) return '';
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  const fracs: [number, string][] = [
    [0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, ''],
  ];
  for (const [v, s] of fracs) {
    if (Math.abs(frac - v) < 0.02) {
      const w = v === 1 ? whole + 1 : whole;
      return s ? (w ? `${w}${s}` : s) : String(w);
    }
  }
  return String(Math.round(n * 100) / 100);
}

/** Grams → "3.15 lb" / "12 oz" / "85 g" for shopping and display. */
export function fmtWeight(grams: number): string {
  if (grams >= 454) return `${Math.round((grams / G_PER.lb) * 100) / 100} lb`;
  if (grams >= 28) return `${Math.round((grams / G_PER.oz) * 10) / 10} oz`;
  return `${Math.round(grams)} g`;
}
