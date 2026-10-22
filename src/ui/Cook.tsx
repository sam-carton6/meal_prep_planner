// Cook tab: batches (planned and cooked), the cook list, starch to cook for planned containers, and stock.

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import type { Batch, Recipe } from '../model';
import { DEFAULT_SETTINGS, newId } from '../model';
import { addDays, dayLabel, isoDate, portionsUsed } from '../plan';
import {
  batchSummary,
  itemGrams,
  mainItem,
  perYieldUnit,
  portionsForProtein,
  scaleItems,
  starchToCook,
  starchToReach,
  times,
  totals,
} from '../recipe-math';
import { fmtAmount } from '../units';
import { ItemList } from './items';
import { Macros, Num, r0, Sheet } from './shared';

export function newBatchFor(recipe: Recipe, date: string): Batch {
  const items = recipe.items.map((i) => ({ ...i }));
  const s = DEFAULT_SETTINGS;
  return {
    id: newId(),
    recipeId: recipe.id,
    recipeName: recipe.name,
    status: 'planned',
    cookDate: date,
    items,
    portions: recipe.kind === 'dish' ? portionsForProtein(totals(items), s.proteinPerMeal) : 1,
    fridge: 0,
    freezer: 0,
    createdAt: new Date().toISOString(),
  };
}

export function CookTab() {
  const batches = useLiveQuery(() => db.batches.orderBy('cookDate').toArray(), []) ?? [];
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const entries = useLiveQuery(() => db.calendar.toArray(), []) ?? [];
  const [editing, setEditing] = useState<{ batch: Batch; recipe?: Recipe } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const today = isoDate(new Date());

  const planned = batches.filter((b) => b.status === 'planned');
  const stock = batches.filter((b) => b.status === 'cooked' && b.fridge + b.freezer > 0);
  const past = batches.filter((b) => b.status === 'cooked' && b.fridge + b.freezer === 0).reverse();

  // Starch for containers on the calendar in the next 2 weeks (e.g. rice for frozen chili).
  const starchNeeds = useMemo(() => {
    const until = addDays(today, 14);
    const need = new Map<string, { cups: number; dates: string[] }>();
    for (const e of entries) {
      if (e.source.kind !== 'batch' || !e.source.starch || e.date < today || e.date > until || e.eaten) continue;
      if (e.source.starch.batchId) continue; // already portioned from a cooked starch batch
      const n = need.get(e.source.starch.recipeId) ?? { cups: 0, dates: [] };
      n.cups += e.source.starch.cups * e.source.portions;
      n.dates.push(e.date);
      need.set(e.source.starch.recipeId, n);
    }
    return [...need].map(([recipeId, n]) => ({ recipe: recipes.find((r) => r.id === recipeId), ...n }));
  }, [entries, recipes, today]);

  const open = (b: Batch) => setEditing({ batch: b, recipe: recipes.find((r) => r.id === b.recipeId) });

  const row = (b: Batch, extra: React.ReactNode) => (
    <li key={b.id}>
      <button onClick={() => open(b)}>
        <span className="name">{b.recipeName}</span>
        <span className="meta">{extra}</span>
      </button>
    </li>
  );

  return (
    <main>
      <header>
        <h1>Cook</h1>
      </header>

      <h3>Cook list</h3>
      {planned.length === 0 && <p className="note">Nothing planned. Plan a batch from a recipe.</p>}
      <ul className="results">
        {planned.map((b) => {
          const s = batchSummary(b);
          return row(b, <>
            {dayLabel(b.cookDate)}{b.cookDate < today ? ' (past, mark cooked?)' : ''} · {b.portions} containers ·{' '}
            <Macros short n={s.each} /> each
          </>);
        })}
      </ul>
      {starchNeeds.map((n) => {
        if (!n.recipe) return null;
        const cook = starchToCook(n.recipe, n.cups);
        const first = n.dates.sort()[0];
        return (
          <div className="card" key={n.recipe.id}>
            <b>{n.recipe.name}</b> for {n.dates.length} planned container{n.dates.length > 1 ? 's' : ''} (first{' '}
            {dayLabel(first)}): {fmtAmount(n.cups)} {n.recipe.yieldUnit} → cook{' '}
            {cook.filter((i) => i.amount !== null).map((i) => `${fmtAmount(Math.max(0.25, Math.round(i.amount! * 4) / 4))} ${i.unit} ${i.name}`).join(', ')}
          </div>
        );
      })}
      <button onClick={() => setChoosing(true)}>+ Plan a batch</button>

      <h3>In the fridge & freezer</h3>
      {stock.length === 0 && <p className="note">Nothing in stock. Cooked batches with containers left show here.</p>}
      <ul className="results">
        {stock.map((b) => {
          const planned = portionsUsed(b.id, entries.filter((e) => !e.eaten));
          return row(b, <>
            🧊 fridge {b.fridge} · ❄️ freezer {b.freezer} · {planned} on the calendar · cooked {dayLabel(b.cookDate)}
          </>);
        })}
      </ul>

      <button className="link" onClick={() => setShowPast(!showPast)}>
        {showPast ? 'Hide' : 'Show'} past batches ({past.length})
      </button>
      {showPast && <ul className="results">{past.map((b) => row(b, <>cooked {dayLabel(b.cookDate)} · {b.portions} containers</>))}</ul>}

      {choosing && (
        <Sheet title="Plan a batch of…" onClose={() => setChoosing(false)}>
          {recipes.length === 0 && <p className="note">No recipes yet.</p>}
          <ul className="results">
            {recipes.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => {
                    setChoosing(false);
                    setEditing({ batch: newBatchFor(r, today), recipe: r });
                  }}
                >
                  <span className="name">{r.name}</span>
                  <span className="meta">{r.kind === 'dish' ? 'Dish' : 'Starch'}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      {editing && <BatchEditor batch={editing.batch} recipe={editing.recipe} onClose={() => setEditing(null)} />}
    </main>
  );
}

export function BatchEditor({ batch, recipe, onClose }: { batch: Batch; recipe?: Recipe; onClose: () => void }) {
  const [b, setB] = useState(batch);
  const [starchId, setStarchId] = useState('');
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  const starches = useLiveQuery(() => db.recipes.where('kind').equals('starch').toArray(), []) ?? [];
  const isNew = useLiveQuery(async () => !(await db.batches.get(batch.id)), [batch.id]);

  const main = recipe ? b.items.find((i) => i.id === recipe.mainItemId) : undefined;
  const s = batchSummary(b);
  const suggested = portionsForProtein(s.total, settings.proteinPerMeal);
  const isStarch = recipe?.kind === 'starch';
  const starch = starches.find((x) => x.id === starchId);

  // Starch batch: how much it makes, scaled by the main ingredient.
  const recipeMain = recipe ? mainItem(recipe) : undefined;
  const factor = recipeMain && main ? itemGrams(main) / Math.max(1e-9, itemGrams(recipeMain)) : 1;
  const yieldNow = (recipe?.yieldAmount ?? 1) * factor;

  const save = async (patch: Partial<Batch> = {}) => {
    await db.batches.put({ ...b, ...patch });
    onClose();
  };

  return (
    <Sheet title={`${b.recipeName} batch`} onClose={onClose}>
      <div className="row">
        <select value={b.status} onChange={(e) => setB({ ...b, status: e.target.value as Batch['status'] })}>
          <option value="planned">Planned</option>
          <option value="cooked">Cooked</option>
        </select>
        <input type="date" value={b.cookDate} onChange={(e) => setB({ ...b, cookDate: e.target.value })} />
      </div>

      {main && recipe && (
        <div className="card">
          <div>
            <b>{main.name}</b>: how much did you buy?
          </div>
          <div className="row">
            <Num
              value={main.amount}
              onChange={(a) => {
                if (a === null || a <= 0) return;
                const scaled = scaleItems({ ...recipe, items: recipe.items }, a * main.gramsPerUnit);
                const items = scaled.map((i) => (i.id === main.id ? { ...i, unit: main.unit, gramsPerUnit: main.gramsPerUnit, amount: a } : i));
                const t = totals(items);
                setB({ ...b, items, portions: isStarch ? b.portions : portionsForProtein(t, settings.proteinPerMeal) });
              }}
            />
            <span>{main.unit}</span>
          </div>
          <div className="note">Everything else scales with it (cans and whole items round). Adjust any line below.</div>
        </div>
      )}

      <div className="card">
        <div>
          Batch: <Macros n={s.total} />
        </div>
        {isStarch ? (
          <div>
            Makes about <b>{fmtAmount(Math.round(yieldNow * 4) / 4)} {recipe?.yieldUnit}</b> ·{' '}
            <Macros short n={times(s.total, 1 / Math.max(1e-9, yieldNow))} /> each
          </div>
        ) : (
          <>
            <div className="row">
              Containers: <Num value={b.portions} onChange={(n) => setB({ ...b, portions: Math.max(1, Math.round(n ?? 1)) })} />
              {suggested !== b.portions && (
                <button onClick={() => setB({ ...b, portions: suggested })}>Use {suggested} (≈{settings.proteinPerMeal} g protein)</button>
              )}
            </div>
            <div>
              Each container: <Macros n={s.each} />
              {s.gramsEach && (
                <>
                  {' '}
                  · <b>{r0(s.gramsEach)} g</b> ({(s.gramsEach / 28.35).toFixed(1)} oz)
                </>
              )}
            </div>
          </>
        )}
      </div>

      <PotWeigher
        cookedWeightG={b.cookedWeightG}
        onChange={(g) => setB({ ...b, cookedWeightG: g })}
        hint={isStarch ? 'cooked weight, for nutrition per 100 g cooked' : 'weight per container'}
      />
      {isStarch && b.cookedWeightG ? (
        <p className="note">
          Cooked: <Macros short n={times(s.total, 100 / b.cookedWeightG)} /> per 100 g
        </p>
      ) : null}

      {!isStarch && (
        <div className="card">
          <div>
            <b>Add a starch</b> to reach ~{settings.mealKcalAim} kcal per container
          </div>
          <select value={starchId} onChange={(e) => setStarchId(e.target.value)}>
            <option value="">Choose…</option>
            {starches.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          {starch && <StarchHint dishKcal={s.each.kcal} dishProtein={s.each.protein} starch={starch} aim={settings.mealKcalAim} containers={b.portions} />}
          {starches.length === 0 && <p className="note">Add a starch recipe (e.g. rice) under Recipes first.</p>}
        </div>
      )}

      {!isStarch && (
        <div className="card">
          <div>
            <b>Containers on hand</b>
            {b.status === 'planned' && <span className="note"> (plan it now, or set it after cooking)</span>}
          </div>
          <div className="fields">
            <label>
              🧊 Fridge
              <Num value={b.fridge} onChange={(n) => setB({ ...b, fridge: Math.max(0, Math.round(n ?? 0)) })} />
            </label>
            <label>
              ❄️ Freezer
              <Num value={b.freezer} onChange={(n) => setB({ ...b, freezer: Math.max(0, Math.round(n ?? 0)) })} />
            </label>
          </div>
        </div>
      )}

      <h3>Ingredients in this batch</h3>
      <ItemList items={b.items} onChange={(items) => setB({ ...b, items })} showScaling={false} />

      <div className="row actions">
        <button className="primary" onClick={() => save()}>
          Save
        </button>
        {b.status === 'planned' && (
          <button onClick={() => save({ status: 'cooked', fridge: b.fridge + b.freezer ? b.fridge : b.portions })}>
            Mark cooked
          </button>
        )}
        {!isNew && (
          <button
            className="danger"
            onClick={async () => {
              if (confirm('Delete this batch?')) {
                await db.batches.delete(b.id);
                onClose();
              }
            }}
          >
            Delete
          </button>
        )}
      </div>
    </Sheet>
  );
}

function StarchHint({ dishKcal, dishProtein, starch, aim, containers }: {
  dishKcal: number; dishProtein: number; starch: Recipe; aim: number; containers: number;
}) {
  const per = perYieldUnit(starch);
  const cups = starchToReach(dishKcal, aim, per.kcal);
  const cook = starchToCook(starch, cups * containers);
  return (
    <div>
      <div>
        Add <b>{fmtAmount(cups)} {starch.yieldUnit}</b> per container → about <b>{r0(dishKcal + cups * per.kcal)} kcal</b>,{' '}
        {r0(dishProtein + cups * per.protein)} g protein
      </div>
      <div className="note">
        For all {containers}: cook{' '}
        {cook.filter((i) => i.amount !== null).map((i) => `${fmtAmount(Math.round(i.amount! * 4) / 4)} ${i.unit} ${i.name}`).join(', ')}
      </div>
    </div>
  );
}

/**
 * Weigh the pot: pick a saved pot (its empty weight is remembered), weigh pot + food, get the food's weight.
 * Pots live in settings; the last one used is picked first next time.
 */
function PotWeigher({ cookedWeightG, onChange, hint }: {
  cookedWeightG?: number;
  onChange: (g: number | undefined) => void;
  hint: string;
}) {
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  const [potId, setPotId] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGrams, setNewGrams] = useState<number | null>(null);

  const chosenId = potId ?? settings.lastPotId ?? '';
  const pot = settings.pots.find((p) => p.id === chosenId);
  const apply = async (t: number | null, p = pot) => {
    setTotal(t);
    if (t !== null && t > 0) {
      onChange(Math.max(0, t - (p?.grams ?? 0)));
      if (p && p.id !== settings.lastPotId) await db.settings.put({ ...(await getSettings()), lastPotId: p.id });
    }
  };
  const savePot = async () => {
    if (!newName.trim() || !newGrams) return;
    const s = await getSettings();
    const p = { id: newId(), name: newName.trim(), grams: newGrams };
    await db.settings.put({ ...s, pots: [...s.pots, p], lastPotId: p.id });
    setPotId(p.id);
    setAdding(false);
    setNewName('');
    setNewGrams(null);
    if (total) onChange(Math.max(0, total - p.grams));
  };

  return (
    <div className="card">
      <div>
        <b>Weigh the pot</b> <span className="note">(optional: {hint})</span>
      </div>
      <div className="fields">
        <label>
          Pot or container
          <select
            value={chosenId}
            onChange={(e) => {
              if (e.target.value === '__new') return setAdding(true);
              setPotId(e.target.value);
              const p = settings.pots.find((x) => x.id === e.target.value);
              if (total) apply(total, p);
            }}
          >
            <option value="">None</option>
            {settings.pots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({r0(p.grams)} g)
              </option>
            ))}
            <option value="__new">+ Save a new pot…</option>
          </select>
        </label>
        <label>
          {pot ? 'Pot + food (g)' : 'Food (g)'}
          <Num value={total} onChange={(t) => apply(t)} placeholder="g" />
        </label>
      </div>
      {adding && (
        <div className="fields">
          <label>
            Pot name
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Big Dutch oven" />
          </label>
          <label>
            Empty weight (g)
            <Num value={newGrams} onChange={setNewGrams} placeholder="g" />
          </label>
          <button className="primary" disabled={!newName.trim() || !newGrams} onClick={savePot}>
            Save pot
          </button>
          <button onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}
      <div className="fields">
        <label>
          Cooked food weight (g)
          <Num value={cookedWeightG} onChange={(g) => onChange(g ?? undefined)} placeholder="g" />
        </label>
      </div>
    </div>
  );
}
