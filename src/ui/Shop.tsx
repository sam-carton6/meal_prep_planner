// Shop tab: the grocery list one shopping week at a time (from the shopping day, Saturday by default, so a
// Sunday cook day is in it): what the week's cook days need, starch for the week's containers, grouped by aisle
// with tick boxes. Pantry things (spices, sauces, rice...) stay off the list, folded into one line that opens to
// mark one running low or put it back on the list; pantry items marked running low go under Restock. ‹ › moves a week; "Pick dates" gives any range.

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import type { Batch, PantryItem } from '../model';
import { DEFAULT_SETTINGS, newId } from '../model';
import { addDays, AISLES, dayLabel, groceryList, isoDate, shopWeek, type GroceryLine } from '../plan';
import { starchToCook } from '../recipe-math';
import { entryStarch } from '../cookdays';
import { addPantry, pantryKeys, removePantry, setLow } from '../pantry';
import { PantryPage } from './Pantry';

export function ShopTab() {
  const today = isoDate(new Date());
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  const shopDay = settings.shopDay ?? 6;
  const [week, setWeek] = useState(0); // weeks from this one
  const [custom, setCustom] = useState<[string, string] | null>(null);
  const [pantryOpen, setPantryOpen] = useState(false);
  const [showPantry, setShowPantry] = useState(false);
  const [thisFrom] = shopWeek(today, shopDay);
  const weekFrom = addDays(thisFrom, 7 * week);
  const [from, to] = custom ?? [weekFrom, addDays(weekFrom, 6)];

  const batches = useLiveQuery(() => db.batches.where('cookDate').between(from, to, true, true).toArray(), [from, to]) ?? [];
  const entries = useLiveQuery(() => db.calendar.where('date').between(from, to, true, true).toArray(), [from, to]) ?? [];
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const listId = `${from}..${to}`;
  const checks = useLiveQuery(() => db.groceryChecks.get(listId), [listId]);
  const checked = new Set(checks?.checked ?? []);
  const extras = checks?.extras ?? [];
  const [extraText, setExtraText] = useState('');

  const planned = batches.filter((b) => b.status === 'planned');

  // Starch for calendar containers that aren't covered by a planned starch batch: shop for it too.
  const starchBatches: Batch[] = useMemo(() => {
    const cups = new Map<string, number>();
    for (const e of entries) {
      const st = entryStarch(e);
      if (st && !e.eaten) cups.set(st.recipeId, (cups.get(st.recipeId) ?? 0) + st.cups);
    }
    const out: Batch[] = [];
    for (const [rid, c] of cups) {
      const r = recipes.find((x) => x.id === rid);
      if (!r || planned.some((b) => b.recipeId === rid)) continue;
      out.push({ id: `starch-${rid}`, recipeId: rid, recipeName: `${r.name} (for the week's containers)`, status: 'planned',
        cookDate: from, items: starchToCook(r, c), portions: 1, fridge: 0, freezer: 0, createdAt: '' });
    }
    return out;
  }, [entries, recipes, planned, from]);

  const pantry = settings.pantry ?? [];
  const lines = groceryList([...planned, ...starchBatches], pantryKeys(settings));
  const toBuy = lines.filter((l) => !l.staple);
  const fromPantry = lines.filter((l) => l.staple);
  const restock = pantry.filter((p) => p.low || checked.has(`pantry:${p.id}`));

  const saveSettings = async (patch: Partial<typeof settings>) => db.settings.put({ ...(await getSettings()), ...patch });
  const toggle = async (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    await db.groceryChecks.put({ id: listId, extras, checked: [...next] });
  };
  const addExtra = async () => {
    const text = extraText.trim();
    if (!text) return;
    await db.groceryChecks.put({ id: listId, checked: [...checked], extras: [...extras, { id: newId(), text }] });
    setExtraText('');
  };
  const removeExtra = async (id: string) => {
    await db.groceryChecks.put({ id: listId, checked: [...checked].filter((k) => k !== `extra:${id}`), extras: extras.filter((x) => x.id !== id) });
  };
  /** Ticking a restock item = bought: no longer low (it stays on this list, ticked). */
  const toggleRestock = async (p: PantryItem) => {
    const key = `pantry:${p.id}`;
    await toggle(key);
    const s = await getSettings();
    await db.settings.put({ ...s, pantry: setLow(s.pantry ?? [], p.id, checked.has(key)) });
  };
  const toPantry = async (l: GroceryLine) => {
    const s = await getSettings();
    await db.settings.put({ ...s, pantry: addPantry(s.pantry ?? [], l.name, newId(), l.key) });
  };
  const outOfPantry = async (l: GroceryLine) => {
    const s = await getSettings();
    const item = (s.pantry ?? []).find((p) => p.key === l.key);
    await db.settings.put({ ...s, ...(item ? removePantry(s, item.id) : { pantryStaples: s.pantryStaples.filter((k) => k !== l.key) }) });
  };
  const runningLow = async (l: GroceryLine) => {
    const s = await getSettings();
    let list = s.pantry ?? [];
    if (!list.some((p) => p.key === l.key)) list = addPantry(list, l.name, newId(), l.key);
    const item = list.find((p) => p.key === l.key);
    if (item) await db.settings.put({ ...s, pantry: setLow(list, item.id, !item.low) });
  };

  const cookNote = planned.length
    ? planned.map((b) => `${b.recipeName} (${dayLabel(b.cookDate)})`).join(', ')
    : 'no cook days';

  return (
    <main className="wide">
      <header>
        <h1>Shop</h1>
        {custom ? (
          <div className="row date-range">
            <input type="date" value={from} onChange={(e) => setCustom([e.target.value, to])} />
            to
            <input type="date" value={to} onChange={(e) => setCustom([from, e.target.value])} />
            <button className="link" onClick={() => setCustom(null)}>By week</button>
          </div>
        ) : (
          <div className="row spread">
            <button className="link" onClick={() => setWeek(week - 1)}>‹ Prev</button>
            <b>
              {week === 0 ? 'This week · ' : week === 1 ? 'Next week · ' : ''}{dayLabel(from)} – {dayLabel(to)}
            </b>
            <button className="link" onClick={() => setWeek(week + 1)}>Next ›</button>
          </div>
        )}
      </header>
      <p className="note">
        Cooking: {cookNote}
        {starchBatches.length ? '; plus starch for the containers eaten this week' : ''}.{' '}
        {!custom && (
          <>
            {week !== 0 && <button className="link small" onClick={() => setWeek(0)}>Back to this week</button>}{' '}
            <button className="link small" onClick={() => setCustom([from, to])}>Pick dates</button>
          </>
        )}
      </p>
      {lines.length === 0 && restock.length === 0 && extras.length === 0 && (
        <p className="note">Nothing to buy. Cook days on the Plan tab (🍳 “+ cook”) put their ingredients here.</p>
      )}

      <div className="aisles">
        {AISLES.map((aisle) => {
          const inAisle = toBuy.filter((l) => l.aisle === aisle);
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
                  <button className="link small muted" onClick={() => toPantry(l)} title="Move to the pantry: off the shopping list">
                    in pantry
                  </button>
                </div>
              ))}
            </section>
          );
        })}

        <section>
          <h3>Extras</h3>
          {extras.map((x) => {
            const key = `extra:${x.id}`;
            return (
              <div key={x.id} className={`grocery ${checked.has(key) ? 'done' : ''}`}>
                <label>
                  <input type="checkbox" checked={checked.has(key)} onChange={() => toggle(key)} />
                  <span>{x.text}</span>
                </label>
                <button className="link small muted" onClick={() => removeExtra(x.id)} title="Take off the list">remove</button>
              </div>
            );
          })}
          <form className="row" onSubmit={(e) => { e.preventDefault(); void addExtra(); }}>
            <input placeholder="Add something else (coffee, paper towels…)" value={extraText} onChange={(e) => setExtraText(e.target.value)} />
            <button type="submit" disabled={!extraText.trim()}>Add</button>
          </form>
        </section>

        {restock.length > 0 && (
          <section>
            <h3>Restock (running low)</h3>
            {restock.map((p) => {
              const key = `pantry:${p.id}`;
              return (
                <div key={p.id} className={`grocery ${checked.has(key) ? 'done' : ''}`}>
                  <label>
                    <input type="checkbox" checked={checked.has(key)} onChange={() => toggleRestock(p)} />
                    <span>{p.name}</span>
                  </label>
                </div>
              );
            })}
          </section>
        )}

        {fromPantry.length > 0 && (
          <section className="pantry-check">
            {/* Off the list (Sam, 7 Nov 2026): folded to one line, opened only to mark something low or buy it. */}
            <button className="link small muted" onClick={() => setShowPantry(!showPantry)}>
              {showPantry ? '▾' : '▸'} {fromPantry.length} thing{fromPantry.length === 1 ? '' : 's'} from your pantry (not on the list)
            </button>
            {showPantry && fromPantry.map((l) => {
              const low = pantry.find((p) => p.key === l.key)?.low;
              return (
                <div key={l.key} className="grocery">
                  <span>
                    <b>{l.amountText}</b> {l.name}
                    <span className="meta">{l.forRecipes.join(', ')}</span>
                  </span>
                  <span className="row">
                    <button className={`link small ${low ? 'warn' : ''}`} onClick={() => runningLow(l)}>
                      {low ? 'low ✓' : 'running low'}
                    </button>
                    <button className="link small" onClick={() => outOfPantry(l)} title="Put it back on the shopping list">
                      buy it
                    </button>
                  </span>
                </div>
              );
            })}
          </section>
        )}
      </div>

      <div className="row">
        <button onClick={() => setPantryOpen(true)}>Pantry ({pantry.length})</button>
        <label className="note">
          Shopping day{' '}
          <select value={shopDay} onChange={(e) => saveSettings({ shopDay: Number(e.target.value) })}>
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </label>
      </div>
      {pantryOpen && <PantryPage onClose={() => setPantryOpen(false)} />}
    </main>
  );
}
