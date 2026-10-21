// Shop tab: one combined grocery list for the batches planned in a date range, plus starch for calendar
// containers. Grouped by aisle, with tick boxes, and pantry staples hidden.

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import type { Batch } from '../model';
import { DEFAULT_SETTINGS } from '../model';
import { addDays, AISLES, dayLabel, groceryList, isoDate } from '../plan';
import { starchToCook } from '../recipe-math';

export function ShopTab() {
  const today = isoDate(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 30));
  const [showStaples, setShowStaples] = useState(false);
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  const batches = useLiveQuery(() => db.batches.where('cookDate').between(from, to, true, true).toArray(), [from, to]) ?? [];
  const entries = useLiveQuery(() => db.calendar.where('date').between(from, to, true, true).toArray(), [from, to]) ?? [];
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const listId = `${from}..${to}`;
  const checks = useLiveQuery(() => db.groceryChecks.get(listId), [listId]);
  const checked = new Set(checks?.checked ?? []);

  const planned = batches.filter((b) => b.status === 'planned');

  // Starch for calendar containers that aren't covered by a planned starch batch: shop for it too.
  const starchBatches: Batch[] = useMemo(() => {
    const cups = new Map<string, number>();
    for (const e of entries) {
      if (e.source.kind === 'batch' && e.source.starch && !e.eaten)
        cups.set(e.source.starch.recipeId, (cups.get(e.source.starch.recipeId) ?? 0) + e.source.starch.cups * e.source.portions);
    }
    const out: Batch[] = [];
    for (const [rid, c] of cups) {
      const r = recipes.find((x) => x.id === rid);
      if (!r || planned.some((b) => b.recipeId === rid)) continue;
      out.push({ id: `starch-${rid}`, recipeId: rid, recipeName: `${r.name} (for planned containers)`, status: 'planned',
        cookDate: from, items: starchToCook(r, c), portions: 1, fridge: 0, freezer: 0, createdAt: '' });
    }
    return out;
  }, [entries, recipes, planned, from]);

  const lines = groceryList([...planned, ...starchBatches], settings.pantryStaples);
  const visible = lines.filter((l) => showStaples || !l.staple);
  const staples = lines.filter((l) => l.staple).length;

  const toggle = async (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    await db.groceryChecks.put({ id: listId, checked: [...next] });
  };
  const toggleStaple = async (key: string) => {
    const s = await getSettings();
    const pantryStaples = s.pantryStaples.includes(key) ? s.pantryStaples.filter((k) => k !== key) : [...s.pantryStaples, key];
    await db.settings.put({ ...s, pantryStaples });
  };

  return (
    <main>
      <header>
        <h1>Shop</h1>
        <div className="row">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          to
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </header>
      <p className="note">
        For {planned.length} planned batch{planned.length === 1 ? '' : 'es'}
        {planned.length ? `: ${planned.map((b) => `${b.recipeName} (${dayLabel(b.cookDate)})`).join(', ')}` : ''}
        {starchBatches.length ? ', plus starch for planned containers' : ''}.
      </p>
      {lines.length === 0 && <p className="note">Plan batches in the Cook tab and they'll show up here.</p>}

      {AISLES.map((aisle) => {
        const inAisle = visible.filter((l) => l.aisle === aisle);
        if (!inAisle.length) return null;
        return (
          <section key={aisle}>
            <h3>{aisle}</h3>
            {inAisle.map((l) => (
              <div key={l.key} className={`grocery ${checked.has(l.key) ? 'done' : ''}`}>
                <label>
                  <input type="checkbox" checked={checked.has(l.key)} onChange={() => toggle(l.key)} />
                  <span>
                    <b>{l.amountText}</b> {l.name}
                    <span className="meta">{l.forRecipes.join(', ')}</span>
                  </span>
                </label>
                <button className="link small" onClick={() => toggleStaple(l.key)}>
                  {l.staple ? 'need it' : 'always have'}
                </button>
              </div>
            ))}
          </section>
        );
      })}
      {staples > 0 && (
        <button className="link" onClick={() => setShowStaples(!showStaples)}>
          {showStaples ? 'Hide' : 'Show'} {staples} pantry staple{staples === 1 ? '' : 's'}
        </button>
      )}
    </main>
  );
}
