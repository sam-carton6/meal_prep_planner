// Recipes tab: the templates. Dishes (protein dishes split into containers) and starches (rice, pasta...).

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import type { Recipe } from '../model';
import { DEFAULT_SETTINGS, newId } from '../model';
import { isoDate } from '../plan';
import { containersFor, mainItem, perPortion, perYieldUnit, portionsForProtein, totals } from '../recipe-math';
import { fmtAmount } from '../units';
import { ItemList } from './items';
import { ConfirmButton, Macros, Num, Sheet } from './shared';
import { recipeRemoval, type RecipeRemoval } from '../cookdays';
import { sizedBatch } from '../weeks';
import { BatchEditor, newBatchFor } from './Cook';

export function RecipesTab() {
  const recipes = useLiveQuery(() => db.recipes.orderBy('name').toArray(), []) ?? [];
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  const [editing, setEditing] = useState<Recipe | null>(null);

  const blank = (kind: Recipe['kind']): Recipe => {
    const now = new Date().toISOString();
    return { id: newId(), name: '', kind, items: [], createdAt: now, updatedAt: now,
      ...(kind === 'starch' ? { yieldAmount: 1, yieldUnit: 'cup cooked' } : {}) };
  };

  return (
    <main className="wide">
      <header>
        <h1>Recipes</h1>
      </header>
      <div className="cols">
      {(['dish', 'starch'] as const).map((kind) => (
        <section key={kind} className="col">
          <h3>{kind === 'dish' ? 'Dishes' : 'Starches & sides'}</h3>
          {recipes.filter((r) => r.kind === kind).length === 0 && (
            <p className="note">
              {kind === 'dish'
                ? 'None yet. Add one, or import your recipes.json under More.'
                : 'Rice, pasta, potatoes: measured per cooked cup and added to containers.'}
            </p>
          )}
          <ul className="results">
            {recipes
              .filter((r) => r.kind === kind)
              .map((r) => {
                const t = totals(r.items);
                return (
                  <li key={r.id}>
                    <button onClick={() => setEditing(r)}>
                      <span className="name">{r.name || 'Untitled'}</span>
                      <span className="meta">
                        {kind === 'dish' ? (
                          <>
                            {containersFor(r, r.items, settings.proteinPerMeal)} containers ·{' '}
                            <Macros short n={perPortion(t, containersFor(r, r.items, settings.proteinPerMeal))} /> each
                          </>
                        ) : (
                          <>
                            <Macros short n={perYieldUnit(r)} /> per {r.yieldUnit ?? 'unit'}
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
          <button onClick={() => setEditing(blank(kind))}>+ New {kind === 'dish' ? 'dish' : 'starch'}</button>
        </section>
      ))}
      </div>
      {editing && <RecipeEditor recipe={editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

function RecipeEditor({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const [r, setR] = useState(recipe);
  const [planning, setPlanning] = useState(false);
  const removal = useLiveQuery(async () => recipeRemoval(recipe.id, await db.calendar.toArray(), await db.batches.toArray()), [recipe.id]);
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  const t = totals(r.items);
  const portions = containersFor(r, r.items, settings.proteinPerMeal);
  const byProtein = portionsForProtein(t, settings.proteinPerMeal);
  const main = mainItem(r);

  const sides = useLiveQuery(() => db.recipes.where('kind').equals('starch').toArray(), []) ?? [];
  const save = async () => {
    const saved = { ...r, name: r.name.trim() || 'Untitled', updatedAt: new Date().toISOString() };
    await db.transaction('rw', db.recipes, db.batches, async () => {
      await db.recipes.put(saved);
      // Cook days the weeks planner set up keep their servings, re-worked from the changed recipe.
      const auto = (await db.batches.where('recipeId').equals(saved.id).toArray()).filter((b) => b.auto && b.status === 'planned');
      await db.batches.bulkPut(auto.map((b) => ({ ...sizedBatch(saved, b.portions, b.cookDate, settings.proteinPerMeal, b.id, b.createdAt), notes: b.notes })));
    });
    onClose();
  };

  return (
    <Sheet title={recipe.name || (r.kind === 'dish' ? 'New dish' : 'New starch')} onClose={onClose}>
      <input className="title-input" placeholder="Name" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />

      <div className="card">
        <div>
          Batch: <Macros n={t} />
        </div>
        {r.kind === 'dish' ? (
          <>
            <div className="row">
              Servings it makes: <Num value={r.servings ?? null} placeholder={String(byProtein)} onChange={(n) => setR({ ...r, servings: n && n > 0 ? Math.round(n) : undefined })} />
              <span className="note">{r.servings ? `(${byProtein} at ${settings.proteinPerMeal} g protein each)` : `blank = split by ${settings.proteinPerMeal} g protein`}</span>
            </div>
            <div>
              <b>{portions} servings</b> of <Macros short n={perPortion(t, portions)} />
            </div>
            <div className="note">
              A serving is one container. Cook days in the weeks planner are scaled to the servings planned, so fewer
              servings here = bigger containers.
            </div>
            <label className="block">
              Usually with{' '}
              <select value={sides.find((x) => x.name.toLowerCase() === r.serveWith?.toLowerCase())?.name ?? ''}
                onChange={(e) => setR({ ...r, serveWith: e.target.value || undefined })}>
                <option value="">Nothing</option>
                {sides.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
              </select>
            </label>
          </>
        ) : (
          <div className="row">
            Makes <Num value={r.yieldAmount} onChange={(n) => setR({ ...r, yieldAmount: n ?? 1 })} />
            <input
              className="unit-input"
              value={r.yieldUnit ?? ''}
              onChange={(e) => setR({ ...r, yieldUnit: e.target.value })}
            />
            → <Macros short n={perYieldUnit(r)} /> each
          </div>
        )}
        {main && (
          <div className="note">
            Main ingredient: {main.name} ({fmtAmount(main.amount ?? 0)} {main.unit}). Batches scale from its weight.
          </div>
        )}
      </div>

      <h3>Ingredients</h3>
      <ItemList
        items={r.items}
        onChange={(items) => setR({ ...r, items, mainItemId: items.some((i) => i.id === r.mainItemId) ? r.mainItemId : items[0]?.id })}
        mainItemId={r.mainItemId}
        onMainChange={(id) => setR({ ...r, mainItemId: id })}
      />

      <h3>Notes</h3>
      <textarea value={r.notes ?? ''} onChange={(e) => setR({ ...r, notes: e.target.value })} rows={3} />

      <div className="row actions">
        <button className="primary" onClick={save}>
          Save
        </button>
        <button
          onClick={async () => {
            await db.recipes.put({ ...r, updatedAt: new Date().toISOString() });
            setPlanning(true);
          }}
        >
          Plan a batch…
        </button>
        <ConfirmButton
          label="Delete"
          confirmLabel="Yes, delete it"
          warning={deleteWarning(r.name, removal)}
          onConfirm={async () => {
            const [entries, batches] = await Promise.all([db.calendar.toArray(), db.batches.toArray()]);
            const x = recipeRemoval(r.id, entries, batches);
            await db.transaction('rw', db.recipes, db.calendar, db.batches, async () => {
              await db.recipes.delete(r.id);
              await db.calendar.bulkDelete(x.deleteEntries);
              await db.calendar.bulkPut(x.updateEntries);
              await db.batches.bulkDelete(x.deleteBatches);
            });
            onClose();
          }}
        />
      </div>
      {planning && (
        <BatchEditor batch={newBatchFor(r, isoDate(new Date()), settings.proteinPerMeal)} recipe={r} onClose={() => { setPlanning(false); onClose(); }} />
      )}
    </Sheet>
  );
}

function deleteWarning(name: string, x: RecipeRemoval | undefined): string {
  const parts: string[] = [];
  const n = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;
  if (x?.deleteEntries.length) parts.push(n(x.deleteEntries.length, 'planned meal'));
  if (x?.deleteBatches.length) parts.push(n(x.deleteBatches.length, 'planned cook day'));
  const also = parts.length ? ` Its ${parts.join(' and ')} go too.` : '';
  const starch = x?.updateEntries.length ? ` ${n(x.updateEntries.length, 'planned meal')} keep their main food without it.` : '';
  return `Delete "${name}"?${also}${starch} Eaten meals and cooked batches stay.`;
}
