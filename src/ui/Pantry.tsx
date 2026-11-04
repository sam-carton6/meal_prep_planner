// Pantry: things kept on hand (sauces, spices, rice, oats, beans...). Kept off the shopping list; "running low"
// puts one on the list under Restock. Add by typing, or tap the suggestions taken from your recipes.

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import type { Settings } from '../model';
import { DEFAULT_SETTINGS, newId } from '../model';
import { addPantry, pantrySuggestions, removePantry, setLow } from '../pantry';
import { Sheet } from './shared';

export function PantryPage({ onClose }: { onClose: () => void }) {
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const [name, setName] = useState('');
  const pantry = settings.pantry ?? [];
  const suggestions = pantrySuggestions(recipes, settings);
  const legacy = settings.pantryStaples.filter((k) => !pantry.some((p) => p.key === k)).length;

  const save = async (patch: (s: Settings) => Partial<Settings>) => {
    const s = await getSettings();
    await db.settings.put({ ...s, ...patch(s) });
  };
  const add = async (n: string, key?: string) => save((s) => ({ pantry: addPantry(s.pantry ?? [], n, newId(), key) }));

  return (
    <Sheet title="Pantry" onClose={onClose}>
      <p className="note">
        Things you keep on hand. They stay off the shopping list (Shop shows how much the week's cooking uses, so you
        can check). Tap <b>running low</b> and it goes on the list to restock.
      </p>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          await add(name);
          setName('');
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. soy sauce, cumin, oats, lentils" />
        <button className="primary" disabled={!name.trim()}>Add</button>
      </form>

      {pantry.length === 0 && <p className="note">Nothing in the pantry yet.</p>}
      <ul className="pantry-list">
        {pantry.map((p) => (
          <li key={p.id} className={p.low ? 'low' : ''}>
            <span className="name">{p.name}</span>
            <button className={`small ${p.low ? 'warn' : ''}`} onClick={() => save((s) => ({ pantry: setLow(s.pantry ?? [], p.id, !p.low) }))}>
              {p.low ? 'Low: on the list' : 'Running low'}
            </button>
            <button className="link small" title="Remove from the pantry" onClick={() => save((s) => removePantry(s, p.id))}>✕</button>
          </li>
        ))}
      </ul>

      {suggestions.length > 0 && (
        <>
          <h3>From your recipes</h3>
          <p className="note">Tap to add. Spices, oils, sauces and dry rice/oats your recipes use.</p>
          <div className="pchips">
            {suggestions.map((s) => (
              <button key={s.key} className="pchip small" onClick={() => add(s.name, s.key)}>+ {s.name}</button>
            ))}
          </div>
        </>
      )}
      {legacy > 0 && (
        <p className="note">
          {legacy} other ingredient{legacy > 1 ? 's are' : ' is'} hidden from shopping lists (marked “always have” before
          the pantry existed).{' '}
          <button className="link small" onClick={() => save((s) => ({ pantryStaples: s.pantryStaples.filter((k) => (s.pantry ?? []).some((p) => p.key === k)) }))}>
            Show them again
          </button>
        </p>
      )}
    </Sheet>
  );
}
