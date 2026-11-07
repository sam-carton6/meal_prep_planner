// More → Import recipes & foods: pick or paste a RECIPE-IMPORT.md file, check how each ingredient was matched to
// USDA (change any), see new vs current numbers for things already in the app, then save.

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import type { CustomFood, Recipe } from '../model';
import { DEFAULT_SETTINGS, newId } from '../model';
import {
  learnedFrom,
  matchFoods,
  parseImportFile,
  recipePreview,
  rematch,
  reviewRecipe,
  sameFood,
  toCustomFood,
  toRecipe,
  type FileFood,
  type ReviewRecipe,
} from '../import-file';
import { buildMeals, daysOf, type FileMeal } from '../past-meals';
import { dayLabel, isoDate } from '../plan';
import { itemNutrition, perPortion, portionsForProtein, totals } from '../recipe-math';
import { search } from '../search';
import { fmtAmount } from '../units';
import type { Food } from '../usda';
import { Macros, r0, Sheet, useFoods } from './shared';

type Choice = 'add' | 'replace' | 'copy' | 'skip';

export function ImportFilePage({ onClose }: { onClose: () => void }) {
  const { foods, index, byId } = useFoods();
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  const existingRecipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const existingFoods = useLiveQuery(() => db.customFoods.toArray(), []) ?? [];
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [reviews, setReviews] = useState<ReviewRecipe[] | null>(null);
  const [fileFoods, setFileFoods] = useState<FileFood[]>([]);
  const [fileMeals, setFileMeals] = useState<FileMeal[]>([]);
  // The file's foods as My foods entries, ids fixed up front so recipe lines can point at them.
  const [fileCustoms, setFileCustoms] = useState<CustomFood[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [changing, setChanging] = useState<{ r: number; l: number } | null>(null);
  const [saved, setSaved] = useState('');

  const recipeMatch = (name: string) => existingRecipes.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
  const foodMatch = (f: FileFood) => existingFoods.find((x) => sameFood(x, { name: f.name, place: f.place ?? undefined }));
  const choiceOf = (key: string, exists: boolean): Choice => choices[key] ?? (exists ? 'replace' : 'add');

  const read = (raw: string) => {
    setError('');
    setSaved('');
    try {
      if (!foods) throw new Error('Still loading the ingredient list. Try again in a second.');
      const f = parseImportFile(raw);
      const learned = settings.importMatches ?? {};
      const customs = f.foods.map((x) => toCustomFood(x, foodMatch(x)?.id));
      const all = [...customs, ...existingFoods.filter((e) => !customs.some((c) => c.id === e.id))];
      setReviews(f.recipes.map((r) => reviewRecipe(r, index, byId, foods, learned, all)));
      setFileFoods(f.foods);
      setFileMeals(f.meals);
      setFileCustoms(customs);
      setChoices({});
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async () => {
    if (!reviews) return;
    const now = new Date().toISOString();
    const recipes: Recipe[] = [];
    reviews.forEach((rv, i) => {
      const old = recipeMatch(rv.file.name);
      const c = choiceOf(`r${i}`, !!old);
      if (c === 'skip') return;
      recipes.push(toRecipe(rv, now, c === 'replace' && old ? { id: old.id, createdAt: old.createdAt } : undefined));
    });
    const customs: CustomFood[] = [];
    fileFoods.forEach((f, i) => {
      const old = foodMatch(f);
      const c = choiceOf(`f${i}`, !!old);
      if (c === 'skip') return;
      const made = fileCustoms[i] ?? toCustomFood(f);
      customs.push(c === 'copy' ? { ...made, id: newId() } : made);
    });
    await db.transaction('rw', db.recipes, db.customFoods, db.settings, async () => {
      await db.recipes.bulkPut(recipes);
      await db.customFoods.bulkPut(customs);
      const s = await getSettings();
      await db.settings.put({ ...s, importMatches: { ...(s.importMatches ?? {}), ...learnedFrom(reviews) } });
    });
    let mealNote = '';
    if (fileMeals.length) {
      // After the recipes and foods, so meals can name ones from this same file.
      const s = await getSettings();
      const learned = s.importMatches ?? {};
      const made = buildMeals(fileMeals, {
        recipes: await db.recipes.toArray(),
        customFoods: await db.customFoods.toArray(),
        entries: await db.calendar.toArray(),
        batches: await db.batches.toArray(),
        proteinPerMeal: s.proteinPerMeal,
        mealKcalAim: s.mealKcalAim,
        usdaFor: (name) => (index && byId ? matchFoods(name, index, byId, 1, learned)[0] : undefined),
        today: isoDate(new Date()),
        newId,
        now,
      });
      await db.transaction('rw', db.calendar, db.batches, async () => {
        await db.batches.bulkPut(made.batches);
        await db.calendar.bulkPut(made.entries);
      });
      mealNote = ` Added ${made.entries.length} meal${made.entries.length === 1 ? '' : 's'} to the calendar`
        + `${made.already ? ` (${made.already} were already there)` : ''}.${made.problems.length ? ` Skipped: ${made.problems.join(' ')}` : ''}`;
    }
    const kept = recipes.length || customs.length || !fileMeals.length
      ? `Saved ${recipes.length} recipe${recipes.length === 1 ? '' : 's'} and ${customs.length} food${customs.length === 1 ? '' : 's'}.` : '';
    setSaved(`${kept}${mealNote}`.trim());
    setReviews(null);
    setFileFoods([]);
    setFileMeals([]);
    setText('');
  };

  if (changing && reviews && foods) {
    const line = reviews[changing.r].lines[changing.l];
    return (
      <PickUsda
        title={`${line.ing.name}: pick the USDA food`}
        start={line.ing.name}
        options={line.options}
        onClose={() => setChanging(null)}
        onPick={(food) => {
          const next = reviews.map((rv, i) =>
            i !== changing.r ? rv : { ...rv, lines: rv.lines.map((l, j) => (j === changing.l ? rematch(l, food, foods) : l)) });
          setReviews(next);
          setChanging(null);
        }}
      />
    );
  }

  return (
    <Sheet title="Import recipes & foods" onClose={onClose}>
      {saved && <p className="ok-note">{saved} Find recipes under Recipes and foods under More → My foods; they're in the meal bank too.</p>}
      {!reviews && (
        <>
          <p className="note">
            Pick the <b>.json</b> file, or paste claude.ai's whole reply (made with the prompt in RECIPE-IMPORT.md). Nothing is saved
            until you've checked it.
          </p>
          <input
            type="file"
            accept=".json,.txt,application/json,text/plain"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) read(await f.text());
              e.target.value = '';
            }}
          />
          <textarea rows={6} placeholder="…or paste here" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="primary" disabled={!text.trim()} onClick={() => read(text)}>Check it</button>
          {error && <p className="error">{error}</p>}
        </>
      )}

      {reviews && (
        <>
          <p className="note">
            Each ingredient was matched to a USDA food. Check the matches (⚠ = worth a look) and tap <b>change</b> to fix one; the app
            remembers your fixes for next time.
          </p>
          {reviews.map((rv, i) => {
            const old = recipeMatch(rv.file.name);
            return (
              <RecipeReview
                key={i}
                rv={rv}
                old={old}
                proteinPerMeal={settings.proteinPerMeal}
                choice={choiceOf(`r${i}`, !!old)}
                onChoice={(c) => setChoices({ ...choices, [`r${i}`]: c })}
                onChange={(l) => setChanging({ r: i, l })}
              />
            );
          })}
          {fileMeals.length > 0 && (
            <>
              <h3>Meals → calendar</h3>
              <p className="note">Days before today come in as eaten, with their Sunday cook day marked cooked. Days that already have the same meal are left alone.</p>
              {fileMeals.map((m, i) => {
                const days = daysOf(m);
                return (
                  <div className="card" key={i}>
                    <b>{m.dish ?? `${m.food}${m.amount ? ` (${fmtAmount(m.amount)}${m.unit ? ` ${m.unit}` : ''})` : ''}`}</b>
                    <div className="meta">
                      {m.slot} · {dayLabel(days[0])}{days.length > 1 ? ` – ${dayLabel(days[days.length - 1])} (${days.length} days)` : ''}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          {fileFoods.length > 0 && <h3>Foods → My foods</h3>}
          {fileFoods.map((f, i) => {
            const old = foodMatch(f);
            const c = choiceOf(`f${i}`, !!old);
            const cf = toCustomFood(f);
            return (
              <div className={`card ${c === 'skip' ? 'skipped' : ''}`} key={i}>
                <div className="row spread">
                  <b>{cf.name}</b>
                  <ChoiceSelect exists={!!old} value={c} onChange={(v) => setChoices({ ...choices, [`f${i}`]: v })} />
                </div>
                <div className="meta">{[cf.brand, cf.place].filter(Boolean).join(' · ')}</div>
                <div>New: <Macros n={cf.perServing} /> per {cf.servingLabel}{cf.servingGrams ? ` (${r0(cf.servingGrams)} g)` : ''}</div>
                {old && <div className="meta">Now: <Macros n={old.perServing} /> per {old.servingLabel}</div>}
                {cf.units?.length ? (
                  <div className="meta">
                    Also by {cf.units.map((u) => `${u.unit} (${r0(u.grams)} g${cf.servingGrams ? `, ${r0((cf.perServing.kcal * u.grams) / cf.servingGrams)} kcal` : ''})`).join(', ')}
                  </div>
                ) : null}
                {cf.units?.length && !cf.servingGrams ? <div className="meta warn">⚠ No serving weight, so the extra units can't be used yet.</div> : null}
              </div>
            );
          })}
          <div className="row actions">
            <button className="primary" onClick={save}>Save these</button>
            <button onClick={() => setReviews(null)}>Start over</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function ChoiceSelect({ exists, value, onChange }: { exists: boolean; value: Choice; onChange: (c: Choice) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Choice)} className="choice">
      {exists ? (
        <>
          <option value="replace">Replace</option>
          <option value="copy">Keep both</option>
        </>
      ) : (
        <option value="add">Add</option>
      )}
      <option value="skip">Skip</option>
    </select>
  );
}

function RecipeReview({ rv, old, proteinPerMeal, choice, onChoice, onChange }: {
  rv: ReviewRecipe;
  old?: Recipe;
  proteinPerMeal: number;
  choice: Choice;
  onChoice: (c: Choice) => void;
  onChange: (line: number) => void;
}) {
  const p = recipePreview(rv, proteinPerMeal);
  const oldTotal = old ? totals(old.items) : undefined;
  const oldN = oldTotal && old?.kind === 'dish' ? portionsForProtein(oldTotal, proteinPerMeal) : undefined;
  return (
    <div className={`card ${choice === 'skip' ? 'skipped' : ''}`}>
      <div className="row spread">
        <span><b>{rv.file.name}</b> <span className="tag">{rv.file.kind === 'starch' ? 'starch' : 'dish'}</span></span>
        <ChoiceSelect exists={!!old} value={choice} onChange={onChoice} />
      </div>
      <div>
        {old ? 'Replaces the recipe with this name. ' : ''}New: <Macros short n={p.total} /> for the batch
        {p.each && <> → ~{p.containers} containers of <Macros short n={p.each} /></>}
      </div>
      {oldTotal && (
        <div className="meta">
          In the app now: {r0(oldTotal.kcal)} kcal · {r0(oldTotal.protein)} g protein
          {oldN ? <> → ~{oldN} containers of {r0(perPortion(oldTotal, oldN).kcal)} kcal</> : null}
        </div>
      )}
      <table className="compare">
        <thead><tr><th>Ingredient → USDA</th><th>kcal</th><th>protein</th></tr></thead>
        <tbody>
          {rv.lines.map((l, j) => {
            const n = itemNutrition(l.item);
            return (
              <tr key={j}>
                <td>
                  {l.ing.amount !== null ? `${fmtAmount(l.ing.amount)} ${l.ing.unit} ` : ''}
                  {l.ing.name}
                  {l.ing.optional && <span className="meta">(optional, not in totals)</span>}
                  <div className="meta">
                    → {l.matched}
                    {l.ing.amount !== null && <> · <button className="link small" onClick={() => onChange(j)}>change</button></>}
                  </div>
                  {l.warn && <div className="meta warn">⚠ {l.warn}</div>}
                </td>
                <td>{l.ing.amount === null ? '' : r0(n.kcal)}</td>
                <td>{l.ing.amount === null ? '' : `${r0(n.protein)} g`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Pick a USDA food for an import line: the best guesses first, then a search. */
function PickUsda({ title, start, options, onPick, onClose }: {
  title: string;
  start: string;
  options: Food[];
  onPick: (f: Food) => void;
  onClose: () => void;
}) {
  const { index } = useFoods();
  const [q, setQ] = useState(start.replace(/,.*$/, ''));
  const hits = useMemo(() => search(index, q, 40), [index, q]);
  const list = [...options, ...hits.filter((h) => !options.some((o) => o.id === h.id))];
  return (
    <Sheet title={title} onClose={onClose}>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoCorrect="off" autoCapitalize="off" placeholder="Search USDA" />
      <ul className="results">
        {list.map((f, i) => (
          <li key={f.id}>
            <button onClick={() => onPick(f)}>
              <span className="name">{i < options.length ? '★ ' : ''}{f.name}</span>
              <span className="meta">{r0(f.per100g.kcal)} kcal · {r0(f.per100g.protein)} g protein per 100 g</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
