// Recipes tab: the templates. Dishes (protein dishes split into containers) and starches (rice, pasta...).

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import type { Recipe } from '../model';
import { DEFAULT_SETTINGS, newId } from '../model';
import { isoDate } from '../plan';
import { mainItem, perPortion, perYieldUnit, portionsForProtein, totals } from '../recipe-math';
import { fmtAmount } from '../units';
import { ItemList } from './items';
import { Macros, Num, Sheet } from './shared';
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
    <main>
      <header>
        <h1>Recipes</h1>
      </header>
      {(['dish', 'starch'] as const).map((kind) => (
        <section key={kind}>
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
                            ~{portionsForProtein(t, settings.proteinPerMeal)} containers ·{' '}
                            <Macros short n={perPortion(t, portionsForProtein(t, settings.proteinPerMeal))} /> each
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
      {editing && <RecipeEditor recipe={editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

function RecipeEditor({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const [r, setR] = useState(recipe);
  const [planning, setPlanning] = useState(false);
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  const t = totals(r.items);
  const portions = portionsForProtein(t, settings.proteinPerMeal);
  const main = mainItem(r);

  const save = async () => {
    await db.recipes.put({ ...r, name: r.name.trim() || 'Untitled', updatedAt: new Date().toISOString() });
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
          <div>
            At {settings.proteinPerMeal} g protein per container: <b>{portions} containers</b> of{' '}
            <Macros short n={perPortion(t, portions)} />
          </div>
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
        <button
          className="danger"
          onClick={async () => {
            if (confirm(`Delete "${r.name}"? Batches already made from it stay.`)) {
              await db.recipes.delete(r.id);
              onClose();
            }
          }}
        >
          Delete
        </button>
      </div>
      {planning && (
        <BatchEditor batch={newBatchFor(r, isoDate(new Date()))} recipe={r} onClose={() => { setPlanning(false); onClose(); }} />
      )}
    </Sheet>
  );
}
