// Prep sheet: one screen for a cook day (e.g. Sunday). What to cook and how much, then how to divide it: how many
// containers of each kind (servings, cups of rice), grams of the dish in each once the pot is weighed, calories
// and protein per container, which day each is for, fridge or freezer, and spare. Then the rice to cook.

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Batch, RecipeItem } from '../model';
import { dayLabel, isoDate, parseDate } from '../plan';
import { coverage, FRIDGE_DAYS } from '../cookdays';
import { prepDates, prepSheet, type PrepDish, type PrepGroup } from '../prep';
import { fmtAmount } from '../units';
import { itemGrams, roundSide, sideStep } from '../recipe-math';
import { BatchEditor, cookedSplit, PotWeigher } from './Cook';
import { Macros, r0, Sheet } from './shared';

const short = (d: string) => `${parseDate(d).toLocaleDateString(undefined, { weekday: 'short' })} ${parseDate(d).getDate()}`;
/** "· 183 g" after anything you'd put on the scale (not spoons, pinches, or amounts already in grams). */
const scaleGrams = (i: RecipeItem) => {
  if (i.amount === null || /^(g|tbsp|tsp|pinch|dash)\b/.test(i.unit)) return '';
  const g = itemGrams(i);
  return g > 0 ? ` · ${Math.round(g).toLocaleString()} g` : '';
};

/** Weights as entered (3.15 lb); cups, spoons and whole things to the nearest quarter. */
const amountText = (n: number, unit: string, name: string) => {
  const exact = /^(lb|oz|g|kg)$/.test(unit) || Math.round(n * 4) === 0;
  return `${fmtAmount(exact ? Math.round(n * 100) / 100 : Math.round(n * 4) / 4)} ${unit} ${name}`;
};
const servings = (n: number) => `${fmtAmount(n)} serving${n === 1 ? '' : 's'}`;

export function PrepSheetPage({ date, onClose }: { date?: string; onClose: () => void }) {
  const today = isoDate(new Date());
  const batches = useLiveQuery(() => db.batches.toArray(), []);
  const entries = useLiveQuery(() => db.calendar.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const [picked, setPicked] = useState<string | undefined>(date);
  const [editing, setEditing] = useState<Batch | null>(null);

  const dates = useMemo(() => prepDates(batches ?? [], today), [batches, today]);
  const day = picked ?? dates[0];
  const sheet = useMemo(() => {
    if (!batches || !entries || !recipes || !day) return null;
    return prepSheet(day, batches, recipes, coverage(entries, batches));
  }, [batches, entries, recipes, day]);
  const loading = !batches || !entries || !recipes;

  return (
    <Sheet title="Prep sheet" onClose={onClose}>
      {!loading && dates.length === 0 && <p className="note">No cook days yet. Add one on the Plan tab (“+ cook” on a day).</p>}
      {dates.length > 0 && (
        <label className="block">
          Cook day{' '}
          <select value={day} onChange={(e) => setPicked(e.target.value)}>
            {(dates.includes(day!) ? dates : [day!, ...dates]).map((d) => (
              <option key={d} value={d}>
                {dayLabel(d)}{d === today ? ' (today)' : ''}: {(batches ?? []).filter((b) => b.cookDate === d).map((b) => b.recipeName.split(/ [&(]/)[0]).join(', ')}
              </option>
            ))}
          </select>
        </label>
      )}
      {sheet && sheet.dishes.length === 0 && dates.length > 0 && <p className="note">Nothing to cook on {dayLabel(day!)}.</p>}
      {sheet?.dishes.map((d) => <PrepDishCard key={d.batch.id} d={d} onEdit={() => setEditing(d.batch)} />)}

      {sheet && sheet.starches.length > 0 && (
        <div className="card prep-dish">
          <h3>🍚 Sides to cook</h3>
          {sheet.starches.map((s) => (
            <div key={s.recipe.id}>
              <b>{s.recipe.name}</b>: {fmtAmount(roundSide(s.cups, sideStep(s.recipe.yieldUnit) === 25 ? 5 : 0.25))} {s.recipe.yieldUnit ?? 'cup'} for {s.containers} container
              {s.containers === 1 ? '' : 's'} → cook{' '}
              <b>{s.cook.filter((i) => i.amount !== null).map((i) => amountText(i.amount!, i.unit, i.name.split(',')[0].toLowerCase())).join(', ')}</b>
              {sideStep(s.recipe.yieldUnit) === 0.5 && (
                // A side made as a batch and split (the salad): weigh each part and divide it between the containers.
                <ul className="prep-items">
                  <li className="note">Per container ({fmtAmount(s.cups / Math.max(1, s.containers))} {s.recipe.yieldUnit}):</li>
                  {s.cook.filter((i) => i.amount !== null && !i.optional).map((i) => {
                    const per = { ...i, amount: i.amount! * (1 / Math.max(1, s.containers)) };
                    const spoon = /^(tbsp|tsp|pinch|dash)\b/.test(i.unit);
                    return <li key={i.id}>{spoon ? amountText(per.amount, i.unit, i.name) : `${Math.round(itemGrams(per))} g ${i.name}`}</li>;
                  })}
                </ul>
              )}
            </div>
          ))}
          <p className="note">Rice per container is in each dish above. Salad: weigh each vegetable and split it evenly.</p>
        </div>
      )}
      {sheet && sheet.dishes.length > 0 && (
        <p className="note">
          ❄️ = more than {FRIDGE_DAYS} days after cooking: freeze it and move it to the fridge the night before.
        </p>
      )}
      {editing && <BatchEditor batch={editing} recipe={recipes?.find((r) => r.id === editing.recipeId)} onClose={() => setEditing(null)} />}
    </Sheet>
  );
}

function PrepDishCard({ d, onEdit }: { d: PrepDish; onEdit: () => void }) {
  const b = d.batch;
  const main = b.items.find((i) => i.id === d.recipe?.mainItemId) ?? b.items.find((i) => i.amount !== null && !i.optional);
  const [all, setAll] = useState(false);
  const [weighing, setWeighing] = useState(!b.cookedWeightG);
  const containers = d.groups.reduce((n, g) => n + g.count, 0);
  return (
    <div className="card prep-dish">
      <h3>
        🍳 {b.recipeName} <span className="tag">{b.status}</span>
      </h3>
      <div>
        {main?.amount ? <>Cook <b>{amountText(main.amount, main.unit, main.name.split(',')[0].toLowerCase())}</b>{scaleGrams(main)} → </> : null}
        <b>{servings(b.portions)}</b> ({d.gramsEach ? <><b>{r0(d.gramsEach)} g</b>, </> : null}<Macros short n={d.each} /> each)
      </div>
      <button className="link small" onClick={() => setAll(!all)}>{all ? 'Hide' : 'Show'} all amounts</button>
      {all && (
        <ul className="prep-items">
          {b.items.map((i) => (
            <li key={i.id}>
              {i.amount === null ? <span className="note">{i.name}{/to taste/i.test(i.name) ? '' : `, ${i.unit}`}</span> : (
                <>{amountText(i.amount, i.unit, i.name)}{scaleGrams(i)}{i.optional ? <span className="note"> (optional)</span> : null}</>
              )}
            </li>
          ))}
        </ul>
      )}

      <h4>Divide it</h4>
      {containers === 0 && <p className="note">No meals planned from this cook day yet.</p>}
      {d.groups.map((g, i) => <GroupRow key={i} g={g} />)}
      {d.spare > 0 && (
        <div className="prep-group spare">
          <b>{fmtAmount(d.spare)} spare</b> serving{d.spare === 1 ? '' : 's'}
          {d.gramsEach ? ` (${r0(d.gramsEach * d.spare)} g)` : ''}: for someone else, or the freezer.
        </div>
      )}
      {d.short > 0 && <div className="warn">⚠ {fmtAmount(d.short)} serving{d.short === 1 ? '' : 's'} short: buy more, or plan fewer.</div>}
      {containers > 0 && (
        <div className="note">
          🧊 {d.fridge} in the fridge{d.freezer ? ` · ❄️ ${d.freezer} in the freezer` : ''}
        </div>
      )}

      {weighing && (
        <PotWeigher
          cookedWeightG={b.cookedWeightG}
          onChange={(g) => db.batches.update(b.id, { cookedWeightG: g })}
          hint="the grams per container show up here"
        />
      )}
      <div className="row">
        {b.status === 'planned' && (
          <button
            className="primary"
            onClick={async () => db.batches.update(b.id, { status: 'cooked', ...(b.fridge + b.freezer ? {} : await cookedSplit(b)) })}
          >
            Mark cooked
          </button>
        )}
        <button onClick={onEdit}>Change amounts…</button>
        <button className="link small" onClick={() => setWeighing(!weighing)}>{weighing ? 'Hide the scale' : 'Weigh the pot'}</button>
      </div>
    </div>
  );
}

function GroupRow({ g }: { g: PrepGroup }) {
  const rice = g.starch && g.cups ? ` + ${fmtAmount(g.cups)} ${(g.starch.yieldUnit ?? 'cup').replace(/ cooked$/, '')} ${g.starch.name.split(',')[0].toLowerCase()}` : '';
  return (
    <div className="prep-group">
      <div>
        <b>{g.count} container{g.count === 1 ? '' : 's'}</b>: {g.grams ? `${r0(g.grams)} g` : servings(g.portions)}
        {g.grams && g.portions !== 1 ? ` (${fmtAmount(g.portions)} servings)` : ''}
        {rice}
      </div>
      <div className="note">
        <Macros short n={g.each} /> each ·{' '}
        {g.meals.map((m, i) => (
          <span key={i} className={m.frozen ? 'frozen' : ''}>{i ? ', ' : ''}{m.frozen ? '❄️ ' : ''}{short(m.date)}</span>
        ))}
      </div>
    </div>
  );
}
