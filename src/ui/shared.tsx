// Small shared pieces: the USDA list (loaded once), number inputs, sheets, nutrition text, food picking.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { CustomFood, FoodRef, Nutrition, RecipeItem } from '../model';
import { newId } from '../model';
import { buildIndex, search, type IndexedItem } from '../search';
import { G_PER, gramsFromLabel, unitOptions, type UnitOption } from '../units';
import { loadFoods, type Food } from '../usda';

// ---- USDA list ---------------------------------------------------------------------------------------

interface FoodsState {
  foods: Food[] | null;
  byId: Map<number, Food>;
  index: IndexedItem<Food>[];
  error?: string;
}
const FoodsContext = createContext<FoodsState>({ foods: null, byId: new Map(), index: [] });

export function FoodsProvider({ children }: { children: ReactNode }) {
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    loadFoods().then(setFoods, (e: Error) => setError(e.message));
  }, []);
  const value = useMemo(
    () => ({ foods, error, byId: new Map((foods ?? []).map((f) => [f.id, f])), index: foods ? buildIndex(foods) : [] }),
    [foods, error],
  );
  return <FoodsContext.Provider value={value}>{children}</FoodsContext.Provider>;
}
export const useFoods = () => useContext(FoodsContext);

// ---- Formatting ----------------------------------------------------------------------------------------

export const r0 = (n: number) => Math.round(n).toLocaleString();
export const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

export function Macros({ n, short }: { n: Nutrition; short?: boolean }) {
  return (
    <span className="macros">
      <b>{r0(n.kcal)}</b> kcal · <b>{r0(n.protein)}</b> g protein
      {!short && (
        <>
          {' '}
          · {r0(n.carbs)} g carbs · {r0(n.fat)} g fat
        </>
      )}
    </span>
  );
}

// ---- Inputs --------------------------------------------------------------------------------------------

/** Number box that lets you type freely ("3.", "") and reports numbers. */
export function Num({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(Math.round(value * 1000) / 1000));
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text);
    if (parsed !== value) setText(value == null ? '' : String(Math.round(value * 1000) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className={`num ${className ?? ''}`}
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const t = e.target.value.trim();
        if (t === '') onChange(null);
        else if (Number.isFinite(Number(t))) onChange(Number(t));
      }}
    />
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet">
      <div className="sheet-head">
        <button className="link" onClick={onClose}>
          ‹ Back
        </button>
        <h2>{title}</h2>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}

// ---- Picking a food (USDA or My foods) ---------------------------------------------------------------

export interface PickedFood {
  food: FoodRef;
  name: string;
  per100g: Nutrition;
  group?: string;
  units: UnitOption[];
}

export function customAsPicked(c: CustomFood): PickedFood {
  const g = c.servingGrams ?? 100;
  const k = 100 / g;
  const label = c.servingLabel.replace(/^1\s+/, '') || 'serving';
  return {
    food: { kind: 'custom', id: c.id },
    name: c.name,
    group: c.group,
    per100g: { kcal: c.perServing.kcal * k, protein: c.perServing.protein * k, carbs: c.perServing.carbs * k, fat: c.perServing.fat * k },
    units: [{ unit: label, gramsPerUnit: g }, ...(c.servingGrams ? unitOptions([]) : [])],
  };
}

export const usdaAsPicked = (f: Food): PickedFood => ({
  food: { kind: 'usda', id: f.id },
  name: f.name,
  group: f.group,
  per100g: f.per100g,
  units: unitOptions(f.portions),
});

/** Units for an item already in a recipe (keeps odd ones like "can (15 oz)" that came from an import). */
export function useUnitsFor(item: Pick<RecipeItem, 'food' | 'unit' | 'gramsPerUnit'>): UnitOption[] {
  const { byId } = useFoods();
  const custom = useLiveQuery(
    () => (item.food.kind === 'custom' ? db.customFoods.get(item.food.id) : undefined),
    [item.food.kind === 'custom' ? item.food.id : ''],
  );
  let opts: UnitOption[] = Object.entries(G_PER).map(([unit, gramsPerUnit]) => ({ unit, gramsPerUnit }));
  if (item.food.kind === 'usda') {
    const f = byId.get(item.food.id);
    if (f) opts = unitOptions(f.portions);
  } else if (item.food.kind === 'custom' && custom) {
    opts = customAsPicked(custom).units;
  }
  if (!opts.some((o) => o.unit === item.unit)) opts = [{ unit: item.unit, gramsPerUnit: item.gramsPerUnit }, ...opts];
  return opts;
}

/** A sensible first unit: lb for meat, "medium" if there is one, else cup, else oz. */
export function defaultUnit(p: PickedFood): UnitOption {
  const find = (u: string) => p.units.find((o) => o.unit === u || o.unit.startsWith(u + ' '));
  if (p.food.kind === 'custom') return p.units[0];
  if (/Beef|Pork|Poultry|Lamb|Sausage|Finfish/.test(p.group ?? '')) return find('lb')!;
  return find('medium') ?? find('cup') ?? find('oz')!;
}

export function itemFromPicked(p: PickedFood): RecipeItem {
  const u = defaultUnit(p);
  return {
    id: newId(),
    name: p.name,
    food: p.food,
    per100g: p.per100g,
    group: p.group,
    amount: 1,
    unit: u.unit,
    gramsPerUnit: u.gramsPerUnit,
    scaling: 'scale',
  };
}

/** Ask for a size like "can (15 oz)" or "bag" + grams. Rough but enough for odd package sizes. */
export function askCustomUnit(): UnitOption | null {
  const label = window.prompt('Name the size, e.g. "can (15 oz)" or "pack (1.5 lb)"');
  if (!label) return null;
  let grams = gramsFromLabel(label);
  if (!grams) {
    const g = window.prompt(`How many grams is one "${label}"?`);
    grams = g ? Number(g) : undefined;
  }
  return grams && grams > 0 ? { unit: label.trim(), gramsPerUnit: grams } : null;
}

export function FoodPicker({ onPick, onClose, title = 'Add ingredient' }: {
  onPick: (p: PickedFood) => void;
  onClose: () => void;
  title?: string;
}) {
  const { index, foods } = useFoods();
  const custom = useLiveQuery(() => db.customFoods.toArray(), []) ?? [];
  const [q, setQ] = useState('');
  const customIndex = useMemo(() => buildIndex(custom), [custom]);
  const usdaHits = useMemo(() => search(index, q, 40), [index, q]);
  const customHits = useMemo(() => (q.trim() ? search(customIndex, q, 10) : custom.slice(0, 10)), [customIndex, custom, q]);
  return (
    <Sheet title={title} onClose={onClose}>
      <input
        type="search"
        autoFocus
        placeholder="Search ingredients and My foods"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoCorrect="off"
        autoCapitalize="off"
      />
      {!foods && <p className="note">Loading ingredients…</p>}
      <ul className="results">
        {customHits.map((c) => (
          <li key={c.id}>
            <button onClick={() => onPick(customAsPicked(c))}>
              <span className="name">{c.name}</span>
              <span className="meta">
                My foods · {c.place ? `${c.place} · ` : ''}
                {r0(c.perServing.kcal)} kcal per {c.servingLabel}
              </span>
            </button>
          </li>
        ))}
        {usdaHits.map((f) => (
          <li key={f.id}>
            <button onClick={() => onPick(usdaAsPicked(f))}>
              <span className="name">{f.name}</span>
              <span className="meta">
                {r0(f.per100g.kcal)} kcal · {r1(f.per100g.protein)} g protein per 100 g
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
