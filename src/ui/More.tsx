// More tab: ingredient lookup, pantry, My foods, targets, backup, and the one-time recipes.json import.

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, exportAll, getSettings, importAll } from '../db';
import { buildImport, type OldFile } from '../import-recipes';
import type { CustomFood, CustomUnit, Settings } from '../model';
import { DEFAULT_SETTINGS, newId } from '../model';
import { isoDate } from '../plan';
import { search, buildIndex } from '../search';
import { forGrams, SOURCE_NAMES, type Food } from '../usda';
import oldRecipes from '../../recipes.json';
import { ConfirmButton, Macros, Num, r0, r1, Sheet, useFoods } from './shared';
import { ImportFilePage } from './ImportFile';
import { FoodLookup } from './FoodLookup';
import { PantryPage } from './Pantry';

type Page = 'ingredients' | 'pantry' | 'myfoods' | 'lookup' | 'targets' | 'backup' | 'importfile' | 'import' | null;

export function MoreTab() {
  const [page, setPage] = useState<Page>(null);
  const items: [Page, string, string][] = [
    ['ingredients', 'Ingredients', 'Look up any USDA ingredient'],
    ['pantry', 'Pantry', 'Spices, sauces, rice, oats: kept off the shopping list until running low'],
    ['myfoods', 'My foods', 'Takeout, treats, and things USDA lacks'],
    ['lookup', 'Look up a packaged food', 'Search Open Food Facts by name or barcode number'],
    ['targets', 'Targets', 'Protein per meal, calories per meal and per day'],
    ['backup', 'Backup', 'Save everything to a file, or restore one'],
    ['importfile', 'Import recipes & foods', 'A file or pasted reply from claude.ai (see RECIPE-IMPORT.md)'],
    ['import', 'Your original recipes.json', 'The recipes you had before the app, recalculated from USDA'],
  ];
  return (
    <main className="wide">
      <header>
        <h1>More</h1>
      </header>
      <ul className="results menu-grid">
        {items.map(([p, title, sub]) => (
          <li key={p}>
            <button onClick={() => setPage(p)}>
              <span className="name">{title}</span>
              <span className="meta">{sub}</span>
            </button>
          </li>
        ))}
      </ul>
      {page === 'ingredients' && <Ingredients onClose={() => setPage(null)} />}
      {page === 'pantry' && <PantryPage onClose={() => setPage(null)} />}
      {page === 'myfoods' && <MyFoods onClose={() => setPage(null)} />}
      {page === 'lookup' && <FoodLookup onClose={() => setPage(null)} />}
      {page === 'targets' && <Targets onClose={() => setPage(null)} />}
      {page === 'backup' && <Backup onClose={() => setPage(null)} />}
      {page === 'importfile' && <ImportFilePage onClose={() => setPage(null)} />}
      {page === 'import' && <ImportPage onClose={() => setPage(null)} />}
    </main>
  );
}

function Ingredients({ onClose }: { onClose: () => void }) {
  const { foods, index } = useFoods();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Food | null>(null);
  const hits = useMemo(() => search(index, q), [index, q]);
  if (sel) {
    const rows: [string, number][] = [['100 g', 100], ['1 oz (28 g)', 28.35], ['1 lb (454 g)', 453.6],
      ...sel.portions.map((p): [string, number] => [`${p.label} (${r1(p.grams)} g)`, p.grams])];
    return (
      <Sheet title={sel.name} onClose={() => setSel(null)}>
        <p className="meta">{sel.group} · {SOURCE_NAMES[sel.source]} #{sel.id}</p>
        <table>
          <thead><tr><th>Amount</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead>
          <tbody>
            {rows.map(([label, g]) => {
              const n = forGrams(sel.per100g, g);
              return <tr key={label}><td>{label}</td><td>{r1(n.kcal)}</td><td>{r1(n.protein)} g</td><td>{r1(n.carbs)} g</td><td>{r1(n.fat)} g</td></tr>;
            })}
          </tbody>
        </table>
      </Sheet>
    );
  }
  return (
    <Sheet title="Ingredients" onClose={onClose}>
      <input type="search" placeholder="Search, e.g. chicken thigh raw" value={q} onChange={(e) => setQ(e.target.value)} autoCorrect="off" autoCapitalize="off" />
      {foods && !q && <p className="note">{foods.length.toLocaleString()} USDA ingredients, works offline.</p>}
      <ul className="results">
        {hits.map((f) => (
          <li key={f.id}>
            <button onClick={() => setSel(f)}>
              <span className="name">{f.name}</span>
              <span className="meta">{r1(f.per100g.kcal)} kcal · {r1(f.per100g.protein)} g protein per 100 g · {f.source === 'fd' ? 'Foundation' : 'SR Legacy'}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function MyFoods({ onClose }: { onClose: () => void }) {
  const foods = useLiveQuery(() => db.customFoods.orderBy('name').toArray(), []) ?? [];
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<CustomFood | null>(null);
  const [lookup, setLookup] = useState(false);
  const idx = useMemo(() => buildIndex(foods.map((f) => ({ ...f, name: `${f.name} ${f.place ?? ''}` }))), [foods]);
  const shown = q ? search(idx, q, 100) : foods;
  return (
    <Sheet title="My foods" onClose={onClose}>
      <p className="note">Your own list: takeout orders, treats, anything USDA doesn't have. It grows as you add things.</p>
      <input type="search" placeholder="Search My foods" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="results">
        {shown.map((f) => (
          <li key={f.id}>
            <button onClick={() => setEdit(foods.find((x) => x.id === f.id)!)}>
              <span className="name">{f.name.trim()}</span>
              <span className="meta">{f.place ? `${f.place} · ` : ''}{f.brand ? `${f.brand} · ` : ''}{r0(f.perServing.kcal)} kcal · {r0(f.perServing.protein)} g protein per {f.servingLabel}{f.units?.length ? ` · also by ${f.units.map((u) => u.unit).join(', ')}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => setEdit({ id: newId(), name: '', perServing: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, servingLabel: '1 serving' })}>
        + Add a food
      </button>
      <button onClick={() => setLookup(true)}>Look up a packaged food…</button>
      {lookup && <FoodLookup onClose={() => setLookup(false)} />}
      {edit && <CustomFoodEditor food={edit} onClose={() => setEdit(null)} />}
    </Sheet>
  );
}

function CustomFoodEditor({ food, onClose }: { food: CustomFood; onClose: () => void }) {
  const [f, setF] = useState(food);
  const n = f.perServing;
  const setN = (k: keyof typeof n, v: number | null) => setF({ ...f, perServing: { ...n, [k]: v ?? 0 } });
  const setUnit = (i: number, u: CustomUnit) => setF({ ...f, units: (f.units ?? []).map((x, j) => (j === i ? u : x)) });
  const clean = (x: CustomFood): CustomFood => {
    const units = (x.units ?? []).map((u) => ({ unit: u.unit.trim(), grams: u.grams })).filter((u) => u.unit && u.grams > 0);
    return { ...x, name: x.name.trim(), units: units.length ? units : undefined };
  };
  return (
    <Sheet title={food.name || 'New food'} onClose={onClose}>
      <label className="block">Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Chicken burrito bowl" /></label>
      <label className="block">Place (optional)<input value={f.place ?? ''} onChange={(e) => setF({ ...f, place: e.target.value || undefined })} placeholder="e.g. Chipotle" /></label>
      <label className="block">Brand (optional)<input value={f.brand ?? ''} onChange={(e) => setF({ ...f, brand: e.target.value || undefined })} placeholder="e.g. Naked Nutrition" /></label>
      <label className="block">Serving<input value={f.servingLabel} onChange={(e) => setF({ ...f, servingLabel: e.target.value })} placeholder="1 bowl" /></label>
      <div className="grid2">
        <label>kcal <Num value={n.kcal} onChange={(v) => setN('kcal', v)} /></label>
        <label>Protein g <Num value={n.protein} onChange={(v) => setN('protein', v)} /></label>
        <label>Carbs g <Num value={n.carbs} onChange={(v) => setN('carbs', v)} /></label>
        <label>Fat g <Num value={n.fat} onChange={(v) => setN('fat', v)} /></label>
        <label>Serving weight g (optional) <Num value={f.servingGrams} onChange={(v) => setF({ ...f, servingGrams: v ?? undefined })} /></label>
      </div>
      <h3>Other units</h3>
      <p className="note">
        {f.servingGrams
          ? 'e.g. scoop = 55 g. The meal bank and recipes can then count it in scoops (and grams).'
          : 'Enter the serving weight above first: units are worked out from grams.'}
      </p>
      {(f.units ?? []).map((u, i) => (
        <div className="fields unit-row" key={i}>
          <label>Unit<input value={u.unit} placeholder="scoop" onChange={(e) => setUnit(i, { ...u, unit: e.target.value })} /></label>
          <label>Grams in one<Num value={u.grams || null} placeholder="g" onChange={(v) => setUnit(i, { ...u, grams: v ?? 0 })} /></label>
          {f.servingGrams && u.grams > 0 ? (
            <span className="note">1 {u.unit || 'unit'} = {r0(n.kcal * u.grams / f.servingGrams)} kcal · {r1(n.protein * u.grams / f.servingGrams)} g protein</span>
          ) : <span />}
          <button className="link danger" onClick={() => setF({ ...f, units: (f.units ?? []).filter((_, j) => j !== i) })}>Remove</button>
        </div>
      ))}
      <button className="small" onClick={() => setF({ ...f, units: [...(f.units ?? []), { unit: '', grams: 0 }] })}>+ Add a unit</button>
      <div className="row actions">
        <button className="primary" disabled={!f.name.trim()} onClick={async () => { await db.customFoods.put(clean(f)); onClose(); }}>Save</button>
        <ConfirmButton label="Delete" confirmLabel="Yes, delete it" warning={`Delete "${f.name}"?`}
          onConfirm={async () => { await db.customFoods.delete(f.id); onClose(); }} />
      </div>
    </Sheet>
  );
}

function Targets({ onClose }: { onClose: () => void }) {
  const saved = useLiveQuery(getSettings, []);
  const [s, setS] = useState<Settings | null>(null);
  const cur = s ?? saved ?? DEFAULT_SETTINGS;
  const field = (k: keyof Settings, label: string) => (
    <label className="block">
      {label} <Num value={cur[k] as number} onChange={(v) => setS({ ...cur, [k]: v ?? 0 })} />
    </label>
  );
  return (
    <Sheet title="Targets" onClose={onClose}>
      {field('proteinPerMeal', 'Protein per container (g)')}
      {field('mealKcalMin', 'Calories per meal, low')}
      {field('mealKcalMax', 'Calories per meal, high')}
      {field('mealKcalAim', 'Calories to aim for per meal container (used for the suggestions)')}
      {field('dayKcalMin', 'Calories per day, low')}
      {field('dayKcalMax', 'Calories per day, high')}
      <button className="primary" onClick={async () => { await db.settings.put(cur); onClose(); }}>Save</button>
    </Sheet>
  );
}

function Backup({ onClose }: { onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const save = async () => {
    const data = JSON.stringify(await exportAll(), null, 1);
    const name = `meal-prep-backup-${isoDate(new Date())}.json`;
    const file = new File([data], name, { type: 'application/json' });
    // On the iPhone this opens the share sheet ("Save to Files"); elsewhere it downloads.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        setMsg('Shared.');
        return;
      } catch {
        /* cancelled: fall back to a download */
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setMsg(`Saved ${name}.`);
  };
  return (
    <Sheet title="Backup" onClose={onClose}>
      <p className="note">Your data lives only on this phone. Save a backup now and then (e.g. to iCloud Drive in Files).</p>
      <button className="primary" onClick={save}>Save a backup file</button>
      <h3>Restore</h3>
      <p className="note">Replaces everything in the app with the backup's contents.</p>
      <input
        type="file"
        accept="application/json,.json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            setPending(JSON.parse(await f.text()));
            setMsg('');
          } catch (err) {
            setMsg(`Couldn't restore: ${(err as Error).message}`);
          }
        }}
      />
      {pending && (
        <div className="card">
          <b>Replace everything in the app with this backup?</b>
          <div className="row">
            <button className="danger" onClick={async () => {
              try {
                await importAll(pending);
                setMsg('Restored.');
              } catch (err) {
                setMsg(`Couldn't restore: ${(err as Error).message}`);
              }
              setPending(null);
            }}>Yes, replace everything</button>
            <button onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className="note">{msg}</p>}
    </Sheet>
  );
}

function ImportPage({ onClose }: { onClose: () => void }) {
  const { foods } = useFoods();
  const existing = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const [done, setDone] = useState(false);
  const result = useMemo(() => (foods ? buildImport(oldRecipes as OldFile, foods) : null), [foods]);
  if (!result) return <Sheet title="Import" onClose={onClose}><p className="note">Loading ingredients…</p></Sheet>;
  const dupes = result.recipes.filter((r) => existing.some((e) => e.name === r.name));
  return (
    <Sheet title="Import recipes.json" onClose={onClose}>
      <p className="note">
        Each ingredient was matched to a USDA food and recalculated. Your old numbers are on the left, USDA's on the right.
        Check anything marked ⚠ (a guess). You can change any of it afterwards in Recipes.
      </p>
      {result.report.map((r) => (
        <div className="card" key={r.name}>
          <h3>{r.name}</h3>
          <div>Old: <b>{r0(r.old.kcal)}</b> kcal · {r0(r.old.protein)} g protein</div>
          <div>USDA: <Macros short n={r.now} /></div>
          <table className="compare">
            <thead><tr><th>Ingredient</th><th>Old</th><th>USDA</th></tr></thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.name}>
                  <td>
                    {l.amountText} {l.name}
                    <div className="meta">→ {l.matched}</div>
                    {l.note && <div className="meta warn">⚠ {l.note}</div>}
                  </td>
                  <td>{r0(l.old.kcal)} / {r0(l.old.protein)}g</td>
                  <td>{r0(l.now.kcal)} / {r0(l.now.protein)}g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {dupes.length > 0 && <p className="note warn">Already in the app: {dupes.map((d) => d.name).join(', ')}. Importing again makes copies.</p>}
      {done ? (
        <p>Imported. Find them under Recipes, and the two cooked batches under Cook (set how many are in the fridge/freezer there).</p>
      ) : (
        <button
          className="primary"
          onClick={async () => {
            await db.transaction('rw', db.recipes, db.batches, db.customFoods, async () => {
              await db.customFoods.bulkAdd(result.customFoods);
              await db.recipes.bulkAdd(result.recipes);
              await db.batches.bulkAdd(result.batches);
            });
            setDone(true);
          }}
        >
          Import these
        </button>
      )}
    </Sheet>
  );
}
